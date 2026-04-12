"""Standardized API response helpers."""
from flask import jsonify


def success(data=None, message="Success", status_code=200):
    return jsonify({"success": True, "message": message, "data": data}), status_code


def created(data=None, message="Created successfully"):
    return success(data, message, 201)


def error(message="Internal server error", status_code=500, errors=None):
    resp = {"success": False, "message": message}
    if errors:
        resp["errors"] = errors
    return jsonify(resp), status_code


def bad_request(message="Bad request", errors=None):
    return error(message, 400, errors)


def unauthorized(message="Unauthorized"):
    return error(message, 401)


def forbidden(message="Forbidden"):
    return error(message, 403)


def not_found(message="Not found"):
    return error(message, 404)


def conflict(message="Conflict"):
    return error(message, 409)
