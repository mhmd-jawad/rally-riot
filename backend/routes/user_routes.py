"""User management routes (admin only)."""
from flask import Blueprint, request, g

import api_response
from auth import authenticate, authorize, hash_password
from models import User
from extensions import db

user_bp = Blueprint("users", __name__)

VALID_ROLES = ("admin", "coach", "player", "parent")


@user_bp.route("/", methods=["POST"])
@authenticate
@authorize("admin")
def create_user():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("full_name", "").strip():
        errors.append({"field": "full_name", "message": "Full name is required."})
    if not data.get("email"):
        errors.append({"field": "email", "message": "Valid email is required."})
    if not data.get("password") or len(data.get("password", "")) < 6:
        errors.append({"field": "password", "message": "Password must be at least 6 characters."})
    if data.get("role") not in VALID_ROLES:
        errors.append({"field": "role", "message": "Role must be admin, coach, player, or parent."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    if User.query.filter_by(email=data["email"]).first():
        return api_response.conflict("A user with this email already exists.")

    user = User(
        full_name=data["full_name"].strip(),
        email=data["email"],
        password_hash=hash_password(data["password"]),
        role=data["role"],
    )
    db.session.add(user)
    db.session.commit()

    return api_response.created(
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
        },
        "User created successfully.",
    )


@user_bp.route("/", methods=["GET"])
@authenticate
@authorize("admin")
def list_users():
    users = User.query.all()
    return api_response.success([{
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users])


@user_bp.route("/<int:user_id>", methods=["GET"])
@authenticate
@authorize("admin")
def get_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return api_response.not_found("User not found.")
    return api_response.success({
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    })


@user_bp.route("/<int:user_id>/role", methods=["PATCH"])
@authenticate
@authorize("admin")
def assign_role(user_id):
    data = request.get_json(silent=True) or {}
    if data.get("role") not in VALID_ROLES:
        return api_response.bad_request("Validation failed.", [
            {"field": "role", "message": "Role must be admin, coach, player, or parent."}
        ])

    user = User.query.get(user_id)
    if not user:
        return api_response.not_found("User not found.")

    user.role = data["role"]
    db.session.commit()

    return api_response.success(
        {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role},
        "Role updated successfully.",
    )
