"""Registration routes: create forms, submit registrations, manage waivers."""
import os
from datetime import datetime
from uuid import uuid4

from flask import Blueprint, current_app, request, g
from werkzeug.utils import secure_filename

import api_response
from auth import authenticate, authorize
from models import (
    RegistrationForm, Registration, WaiverFile, Team,
    TeamPlayer, User, ParentChildLink
)
from extensions import db
from services import InvoiceService, NotificationService

registration_bp = Blueprint("registrations", __name__)


def _get_registration(reg_id):
    return Registration.query.get(reg_id)


def _parent_can_access_registration(registration):
    if g.user["role"] != "parent":
        return True
    if registration.parent_user_id != g.user["id"]:
        return False
    return ParentChildLink.query.filter_by(
        parent_user_id=g.user["id"],
        child_user_id=registration.player_user_id,
    ).first() is not None


def _save_waiver_file(upload, registration_id):
    allowed_mime_types = set(current_app.config.get("ALLOWED_MIME_TYPES", []))
    if upload.mimetype not in allowed_mime_types:
        return None, api_response.bad_request(
            "Unsupported file type.",
            [{"field": "file", "message": "Waiver must be a PDF, PNG, or JPEG file."}],
        )

    upload.stream.seek(0, os.SEEK_END)
    file_size = upload.stream.tell()
    upload.stream.seek(0)
    if file_size > current_app.config["MAX_FILE_SIZE"]:
        return None, api_response.bad_request(
            "File is too large.",
            [{"field": "file", "message": "Waiver exceeds the maximum allowed file size."}],
        )

    original_name = secure_filename(upload.filename) or "waiver"
    ext = os.path.splitext(original_name)[1].lower()
    save_dir = os.path.join(current_app.config["UPLOAD_DIR"], "waivers")
    os.makedirs(save_dir, exist_ok=True)

    save_name = f"registration-{registration_id}-{uuid4().hex}{ext}"
    save_path = os.path.join(save_dir, save_name)
    upload.save(save_path)
    return save_path, None


# ── Registration Forms ────────────────────────────────────────
@registration_bp.route("/forms", methods=["POST"])
@authenticate
@authorize("admin")
def create_form():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("title", "").strip():
        errors.append({"field": "title", "message": "Title is required."})
    if not data.get("team_id"):
        errors.append({"field": "team_id", "message": "Team ID is required."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    team = Team.query.get(data["team_id"])
    if not team:
        return api_response.not_found("Team not found.")

    form = RegistrationForm(
        title=data["title"].strip(),
        description=data.get("description"),
        team_id=data["team_id"],
        season=data.get("season"),
        fee=data.get("fee", data.get("fee_amount", 0.0)),
        requires_waiver=bool(data.get("requires_waiver", False)),
        is_active=data.get("is_active", True),
        created_by_user_id=g.user["id"],
    )
    db.session.add(form)
    db.session.commit()
    return api_response.created(form.to_dict(), "Registration form created.")


@registration_bp.route("/forms", methods=["GET"])
@authenticate
def list_forms():
    forms = RegistrationForm.query.order_by(RegistrationForm.created_at.desc()).all()
    return api_response.success([f.to_dict() for f in forms])


@registration_bp.route("/forms/<int:form_id>", methods=["GET"])
@authenticate
def get_form(form_id):
    form = RegistrationForm.query.get(form_id)
    if not form:
        return api_response.not_found("Registration form not found.")
    return api_response.success(form.to_dict())


@registration_bp.route("/forms/<int:form_id>", methods=["PATCH"])
@authenticate
@authorize("admin")
def update_form(form_id):
    form = RegistrationForm.query.get(form_id)
    if not form:
        return api_response.not_found("Registration form not found.")

    data = request.get_json(silent=True) or {}
    for key in ("title", "description", "season", "fee", "is_active", "requires_waiver"):
        if key in data:
            setattr(form, key, data[key])
    db.session.commit()
    return api_response.success(form.to_dict(), "Registration form updated.")


# ── Registrations ─────────────────────────────────────────────
@registration_bp.route("/", methods=["POST"])
@authenticate
@authorize("parent", "admin")
def submit_registration():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("form_id"):
        errors.append({"field": "form_id", "message": "form_id is required."})
    if not data.get("player_user_id"):
        errors.append({"field": "player_user_id", "message": "player_user_id is required."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    form = RegistrationForm.query.get(data["form_id"])
    if not form:
        return api_response.not_found("Registration form not found.")
    if g.user["role"] == "parent" and not form.is_active:
        return api_response.conflict("This registration form is not currently active.")

    player = User.query.get(data["player_user_id"])
    if not player or player.role != "player":
        return api_response.bad_request("Player must be an existing user with the player role.")

    if g.user["role"] == "parent":
        if data.get("parent_user_id") and data["parent_user_id"] != g.user["id"]:
            return api_response.forbidden("Parents can only submit registrations for themselves.")
        link = ParentChildLink.query.filter_by(
            parent_user_id=g.user["id"],
            child_user_id=player.id,
        ).first()
        if not link:
            return api_response.forbidden("You can only register children linked to your account.")
        parent_id = g.user["id"]
    else:
        parent_id = data.get("parent_user_id")
        if not parent_id:
            return api_response.bad_request("parent_user_id is required when an admin submits a registration.")
        parent = User.query.get(parent_id)
        if not parent or parent.role != "parent":
            return api_response.bad_request("parent_user_id must belong to an existing parent user.")
        if not ParentChildLink.query.filter_by(parent_user_id=parent_id, child_user_id=player.id).first():
            return api_response.bad_request("Parent must be linked to the selected child before registration.")

    # Check duplicate registration
    existing = Registration.query.filter_by(
        form_id=data["form_id"],
        player_user_id=player.id,
    ).first()
    if existing:
        return api_response.conflict("Player is already registered for this form.")

    reg = Registration(
        form_id=data["form_id"],
        player_user_id=player.id,
        parent_user_id=parent_id,
        status="pending",
    )
    db.session.add(reg)
    db.session.flush()

    # Auto-generate invoice if form has a fee
    invoice = None
    if form.fee and form.fee > 0:
        invoice = InvoiceService.generate_from_registration(reg, form)

    db.session.commit()

    result = {"registration": reg.to_dict(include_relations=True)}
    if invoice:
        result["invoice"] = invoice.to_dict(include_relations=True)
    return api_response.created(result, "Registration submitted.")


@registration_bp.route("/", methods=["GET"])
@authenticate
@authorize("admin", "parent")
def list_registrations():
    form_id = request.args.get("form_id", type=int)
    query = Registration.query
    if form_id:
        query = query.filter_by(form_id=form_id)
    # Parents only see their own registrations
    if g.user["role"] == "parent":
        query = query.filter_by(parent_user_id=g.user["id"])
    registrations = query.order_by(Registration.created_at.desc()).all()
    return api_response.success([r.to_dict(include_relations=True) for r in registrations])


@registration_bp.route("/<int:reg_id>", methods=["GET"])
@authenticate
@authorize("admin", "parent")
def get_registration(reg_id):
    reg = _get_registration(reg_id)
    if not reg:
        return api_response.not_found("Registration not found.")
    if not _parent_can_access_registration(reg):
        return api_response.forbidden("You can only view registrations for your linked children.")
    return api_response.success(reg.to_dict(include_relations=True))


@registration_bp.route("/<int:reg_id>/status", methods=["PATCH"])
@authenticate
@authorize("admin")
def update_registration_status(reg_id):
    reg = _get_registration(reg_id)
    if not reg:
        return api_response.not_found("Registration not found.")

    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in ("pending", "approved", "rejected"):
        return api_response.bad_request("Status must be pending, approved, or rejected.")

    form = reg.form
    if status == "approved" and form and form.requires_waiver and not reg.waiver:
        return api_response.conflict("A waiver must be uploaded before this registration can be approved.")

    old_status = reg.status
    reg.status = status

    if status == "approved" and old_status != "approved":
        # Auto-add player to team
        if form:
            from models import TeamPlayer as TP
            exists = TP.query.filter_by(team_id=form.team_id, player_user_id=reg.player_user_id).first()
            if not exists:
                db.session.add(TP(team_id=form.team_id, player_user_id=reg.player_user_id))

    # Notify parent
    NotificationService.notify(
        reg.parent_user_id,
        "registration_update",
        f"Registration status changed to {status}.",
    )

    db.session.commit()

    return api_response.success(reg.to_dict(include_relations=True), "Registration status updated.")


# ── Waivers ───────────────────────────────────────────────────
@registration_bp.route("/<int:reg_id>/waivers", methods=["POST"])
@authenticate
@authorize("admin", "parent")
def upload_waiver(reg_id):
    reg = _get_registration(reg_id)
    if not reg:
        return api_response.not_found("Registration not found.")
    if not _parent_can_access_registration(reg):
        return api_response.forbidden("You can only upload waivers for your linked children.")

    upload = request.files.get("file")
    if not upload or not upload.filename:
        return api_response.bad_request(
            "Validation failed.",
            [{"field": "file", "message": "A waiver file is required."}],
        )

    file_path, error_response = _save_waiver_file(upload, reg.id)
    if error_response:
        return error_response

    waiver = reg.waiver
    if waiver:
        waiver.file_path = file_path
        waiver.uploaded_at = datetime.utcnow()
        db.session.commit()
        return api_response.success(waiver.to_dict(), "Waiver uploaded.")

    waiver = WaiverFile(registration_id=reg.id, file_path=file_path)
    db.session.add(waiver)
    db.session.commit()
    return api_response.created(waiver.to_dict(), "Waiver uploaded.")


@registration_bp.route("/<int:reg_id>/waivers", methods=["GET"])
@authenticate
@authorize("admin", "parent")
def list_waivers(reg_id):
    reg = _get_registration(reg_id)
    if not reg:
        return api_response.not_found("Registration not found.")
    if not _parent_can_access_registration(reg):
        return api_response.forbidden("You can only view waivers for your linked children.")
    waivers = WaiverFile.query.filter_by(registration_id=reg.id).all()
    return api_response.success([w.to_dict() for w in waivers])
