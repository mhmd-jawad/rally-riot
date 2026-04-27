"""Invoice routes."""
from datetime import datetime
from flask import Blueprint, g, request
from sqlalchemy import or_

import api_response
from auth import authenticate, authorize
from models import Invoice, Discount, InstallmentPlan, InstallmentPayment, RegistrationForm, User, ParentChildLink
from extensions import db

invoice_bp = Blueprint("invoices", __name__)


@invoice_bp.route("/", methods=["GET"])
@authenticate
@authorize("parent", "admin", "player")
def list_invoices():
    """Get invoices. Parents see their own; players see their own; admins see all."""
    role = g.user["role"]
    if role == "admin":
        invoices = Invoice.query.order_by(Invoice.created_at.desc()).all()
    elif role == "player":
        invoices = Invoice.query.filter_by(player_user_id=g.user["id"]).order_by(Invoice.created_at.desc()).all()
    else:
        invoices = Invoice.query.filter_by(parent_user_id=g.user["id"]).order_by(Invoice.created_at.desc()).all()

    rows = []
    total_amount = 0
    total_paid = 0
    total_outstanding = 0
    for inv in invoices:
        d = inv.to_dict(include_relations=True)
        total_amount += float(inv.amount)
        total_paid += float(inv.amount_paid)
        total_outstanding += float(d["outstanding_balance"])
        rows.append(d)

    return api_response.success({
        "invoices": rows,
        "summary": {
            "total": len(rows),
            "total_amount": total_amount,
            "total_paid": total_paid,
            "total_outstanding": total_outstanding,
        },
    })


@invoice_bp.route("/<int:invoice_id>", methods=["GET"])
@authenticate
@authorize("parent", "admin", "player")
def get_invoice(invoice_id):
    inv = Invoice.query.get(invoice_id)
    if not inv:
        return api_response.not_found("Invoice not found.")

    role = g.user["role"]
    if role == "parent" and inv.parent_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")
    if role == "player" and inv.player_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")

    return api_response.success(inv.to_dict(include_relations=True))


@invoice_bp.route("/<int:invoice_id>/pay", methods=["PATCH"])
@authenticate
@authorize("parent", "admin", "player")
def mark_paid(invoice_id):
    inv = Invoice.query.get(invoice_id)
    if not inv:
        return api_response.not_found("Invoice not found.")

    role = g.user["role"]
    if role == "parent" and inv.parent_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")
    if role == "player" and inv.player_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")

    if inv.status == "paid":
        return api_response.conflict("Invoice is already paid.")

    outstanding = round(float(inv.amount) - float(inv.amount_paid), 2)

    # Deduct from payer's wallet (admin bypasses the wallet check)
    if role != "admin":
        payer = User.query.get(g.user["id"])
        if not payer:
            return api_response.not_found("Payer not found.")
        balance = round(float(payer.wallet_balance or 0), 2)
        if balance < outstanding:
            return api_response.bad_request(
                f"Insufficient wallet balance. You have ${balance:.2f} but need ${outstanding:.2f}. "
                "Please ask an admin to top up your wallet."
            )
        payer.wallet_balance = round(balance - outstanding, 2)

    inv.amount_paid = inv.amount
    inv.status = "paid"

    # Mark all installments paid too
    plan = InstallmentPlan.query.filter_by(invoice_id=inv.id).first()
    if plan:
        for p in plan.payments.all():
            p.status = "paid"
            p.paid_at = datetime.utcnow()

    db.session.commit()
    return api_response.success(inv.to_dict(include_relations=True), "Invoice marked as paid.")


# ── Discounts ──────────────────────────────────────────────────

@invoice_bp.route("/discounts", methods=["POST"])
@authenticate
@authorize("admin")
def create_discount():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("form_id"):
        errors.append({"field": "form_id", "message": "form_id is required."})
    if not data.get("label", "").strip():
        errors.append({"field": "label", "message": "label is required."})
    if data.get("discount_type") not in ("percentage", "fixed"):
        errors.append({"field": "discount_type", "message": "discount_type must be percentage or fixed."})
    if not isinstance(data.get("value"), (int, float)) or data.get("value", 0) <= 0:
        errors.append({"field": "value", "message": "value must be a positive number."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    form = RegistrationForm.query.get(data["form_id"])
    if not form:
        return api_response.not_found("Registration form not found.")

    target_user_id = data.get("target_user_id")
    if target_user_id is not None:
        try:
            target_user_id = int(target_user_id)
        except (TypeError, ValueError):
            return api_response.bad_request("target_user_id must be an integer.")
        target_user = User.query.get(target_user_id)
        if not target_user or target_user.role != "player":
            return api_response.bad_request("target_user_id must belong to an existing player.")

    discount = Discount(
        form_id=data["form_id"],
        target_user_id=target_user_id,
        label=data["label"].strip(),
        discount_type=data["discount_type"],
        value=float(data["value"]),
    )
    db.session.add(discount)
    db.session.commit()
    return api_response.created(discount.to_dict(), "Discount created.")


@invoice_bp.route("/discounts/<int:form_id>", methods=["GET"])
@authenticate
@authorize("admin", "parent")
def list_discounts(form_id):
    query = Discount.query.filter_by(form_id=form_id)
    if g.user["role"] == "parent":
        child_ids = [
            row.child_user_id
            for row in ParentChildLink.query.filter_by(parent_user_id=g.user["id"]).all()
        ]
        query = query.filter(
            or_(
                Discount.target_user_id.is_(None),
                Discount.target_user_id.in_(child_ids or [-1]),
            )
        )
    discounts = query.all()
    return api_response.success([d.to_dict() for d in discounts])


@invoice_bp.route("/discounts/<int:discount_id>", methods=["DELETE"])
@authenticate
@authorize("admin")
def delete_discount(discount_id):
    discount = Discount.query.get(discount_id)
    if not discount:
        return api_response.not_found("Discount not found.")
    db.session.delete(discount)
    db.session.commit()
    return api_response.success(None, "Discount deleted.")


# ── Installments ───────────────────────────────────────────────

@invoice_bp.route("/<int:invoice_id>/installments", methods=["GET"])
@authenticate
@authorize("parent", "admin")
def get_installments(invoice_id):
    inv = Invoice.query.get(invoice_id)
    if not inv:
        return api_response.not_found("Invoice not found.")
    if g.user["role"] == "parent" and inv.parent_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")
    plan = InstallmentPlan.query.filter_by(invoice_id=invoice_id).first()
    if not plan:
        return api_response.success(None)
    return api_response.success(plan.to_dict())


@invoice_bp.route("/installments/<int:payment_id>/pay", methods=["PATCH"])
@authenticate
@authorize("parent", "admin", "player")
def pay_installment(payment_id):
    payment = InstallmentPayment.query.get(payment_id)
    if not payment:
        return api_response.not_found("Installment payment not found.")

    plan = InstallmentPlan.query.get(payment.plan_id)
    inv = Invoice.query.get(plan.invoice_id)

    role = g.user["role"]
    if role == "parent" and inv.parent_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")
    if role == "player" and inv.player_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")

    if payment.status == "paid":
        return api_response.conflict("This installment is already paid.")

    installment_amount = round(float(payment.amount), 2)

    # Deduct from payer's wallet (admin bypasses)
    if role != "admin":
        payer = User.query.get(g.user["id"])
        if not payer:
            return api_response.not_found("Payer not found.")
        balance = round(float(payer.wallet_balance or 0), 2)
        if balance < installment_amount:
            return api_response.bad_request(
                f"Insufficient wallet balance. You have ${balance:.2f} but need ${installment_amount:.2f}. "
                "Please ask an admin to top up your wallet."
            )
        payer.wallet_balance = round(balance - installment_amount, 2)

    payment.status = "paid"
    payment.paid_at = datetime.utcnow()

    inv.amount_paid = round(float(inv.amount_paid) + installment_amount, 2)
    if inv.amount_paid >= inv.amount:
        inv.status = "paid"

    db.session.commit()
    return api_response.success(payment.to_dict(), "Installment paid.")
