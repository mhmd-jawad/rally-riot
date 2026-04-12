"""Authentication and authorization middleware / decorators."""
from functools import wraps
from datetime import timedelta

import bcrypt
import jwt as pyjwt
from flask import request, g, current_app

import api_response


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password, hashed):
    return bcrypt.checkpw(password.encode(), hashed.encode() if isinstance(hashed, str) else hashed)


def generate_token(user):
    from datetime import datetime
    payload = {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(seconds=current_app.config["JWT_ACCESS_TOKEN_EXPIRES"]),
    }
    return pyjwt.encode(payload, current_app.config["JWT_SECRET_KEY"], algorithm="HS256")


def authenticate(f):
    """Decorator: verify JWT Bearer token and attach user to g.user."""
    @wraps(f)
    def decorated(*args, **kwargs):
        from models import User
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return api_response.unauthorized("Authentication required. Provide a valid Bearer token.")

        token = auth_header.split(" ", 1)[1]
        try:
            decoded = pyjwt.decode(token, current_app.config["JWT_SECRET_KEY"], algorithms=["HS256"])
        except (pyjwt.ExpiredSignatureError, pyjwt.InvalidTokenError):
            return api_response.unauthorized("Invalid or expired token.")

        user = User.query.get(decoded["id"])
        if not user or not user.is_active:
            return api_response.unauthorized("User not found or account deactivated.")

        g.user = {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "full_name": user.full_name,
        }
        return f(*args, **kwargs)

    return decorated


def authorize(*allowed_roles):
    """Decorator factory: restrict to specified roles. Must be used AFTER @authenticate."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, "user") or not g.user:
                return api_response.unauthorized("Authentication required.")
            if g.user["role"] not in allowed_roles:
                return api_response.forbidden("You do not have permission to perform this action.")
            return f(*args, **kwargs)
        return decorated
    return decorator
