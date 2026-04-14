"""Invoice routes."""
from flask import Blueprint, g

import api_response
from auth import authenticate, authorize
from models import Invoice
from extensions import db

invoice_bp = Blueprint("invoices", __name__)


@invoice_bp.route("/", methods=["GET"])
@authenticate
@authorize("parent", "admin")
def list_invoices():
    """Get invoices. Parents see their own; admins see all."""
    if g.user["role"] == "admin":
        invoices = Invoice.query.order_by(Invoice.created_at.desc()).all()
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
@authorize("parent", "admin")
def get_invoice(invoice_id):
    inv = Invoice.query.get(invoice_id)
    if not inv:
        return api_response.not_found("Invoice not found.")

    if g.user["role"] == "parent" and inv.parent_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")

    return api_response.success(inv.to_dict(include_relations=True))


@invoice_bp.route("/<int:invoice_id>/pay", methods=["PATCH"])
@authenticate
@authorize("parent", "admin")
def mark_paid(invoice_id):
    inv = Invoice.query.get(invoice_id)
    if not inv:
        return api_response.not_found("Invoice not found.")

    if g.user["role"] == "parent" and inv.parent_user_id != g.user["id"]:
        return api_response.forbidden("Access denied.")

    inv.amount_paid = inv.amount
    inv.status = "paid"
    db.session.commit()
    return api_response.success(inv.to_dict(include_relations=True), "Invoice marked as paid.")
