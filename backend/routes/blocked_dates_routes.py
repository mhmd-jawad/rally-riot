"""Blocked dates (holidays, exam periods) — admin-only management."""
from datetime import date
from flask import Blueprint, request, g

import api_response
from auth import authenticate, authorize
from models import BlockedDate
from extensions import db

blocked_dates_bp = Blueprint("blocked_dates", __name__)

VALID_TYPES = ("holiday", "exam")


@blocked_dates_bp.route("/", methods=["GET"])
@authenticate
def list_blocked_dates():
    rows = BlockedDate.query.order_by(BlockedDate.start_date.asc()).all()
    return api_response.success([r.to_dict() for r in rows])


@blocked_dates_bp.route("/", methods=["POST"])
@authenticate
@authorize("admin")
def create_blocked_date():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("label", "").strip():
        errors.append({"field": "label", "message": "Label is required."})
    if not data.get("start_date"):
        errors.append({"field": "start_date", "message": "start_date is required (YYYY-MM-DD)."})
    if not data.get("end_date"):
        errors.append({"field": "end_date", "message": "end_date is required (YYYY-MM-DD)."})
    block_type = data.get("block_type", "holiday")
    if block_type not in VALID_TYPES:
        errors.append({"field": "block_type", "message": "block_type must be holiday or exam."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    try:
        start = date.fromisoformat(data["start_date"])
        end = date.fromisoformat(data["end_date"])
    except ValueError:
        return api_response.bad_request("Dates must be valid YYYY-MM-DD.")

    if end < start:
        return api_response.bad_request("end_date must be on or after start_date.")

    bd = BlockedDate(
        label=data["label"].strip(),
        block_type=block_type,
        start_date=data["start_date"],
        end_date=data["end_date"],
        created_by_user_id=g.user["id"],
    )
    db.session.add(bd)
    db.session.commit()
    return api_response.created(bd.to_dict(), "Blocked date created.")


@blocked_dates_bp.route("/<int:bd_id>", methods=["DELETE"])
@authenticate
@authorize("admin")
def delete_blocked_date(bd_id):
    bd = BlockedDate.query.get(bd_id)
    if not bd:
        return api_response.not_found("Blocked date not found.")
    db.session.delete(bd)
    db.session.commit()
    return api_response.success(None, "Blocked date deleted.")
