"""Auth routes: login, me, logout."""
from flask import Blueprint, request, g

import api_response
from auth import authenticate, check_password, generate_token
from models import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    password = data.get("password")

    errors = []
    if not email:
        errors.append({"field": "email", "message": "Valid email is required."})
    if not password:
        errors.append({"field": "password", "message": "Password is required."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    user = User.query.filter_by(email=email).first()
    if not user:
        return api_response.unauthorized("Invalid email or password.")
    if not user.is_active:
        return api_response.unauthorized("Account is deactivated.")
    if not check_password(password, user.password_hash):
        return api_response.unauthorized("Invalid email or password.")

    token = generate_token(user)
    return api_response.success(
        {
            "token": token,
            "user": {
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "role": user.role,
            },
        },
        "Login successful.",
    )


@auth_bp.route("/me", methods=["GET"])
@authenticate
def me():
    user = User.query.get(g.user["id"])
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


@auth_bp.route("/logout", methods=["POST"])
def logout():
    # Stateless JWT – just acknowledge the logout
    return api_response.success(None, "Logged out successfully.")


@auth_bp.route("/register", methods=["POST"])
def register():
    return api_response.forbidden(
        "Public sign-up is disabled. Ask a club admin to create your account."
    )
