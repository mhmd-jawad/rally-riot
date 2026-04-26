"""Parent-child linking routes."""
from flask import Blueprint, request, g

import api_response
from auth import authenticate, authorize
from models import ParentChildLink, User
from extensions import db

parent_child_bp = Blueprint("parent_child", __name__)


@parent_child_bp.route("/", methods=["POST"])
@authenticate
@authorize("parent", "admin")
def link_child():
    data = request.get_json(silent=True) or {}
    child_user_id = data.get("child_user_id")
    if not child_user_id:
        return api_response.bad_request("Validation failed.", [
            {"field": "child_user_id", "message": "Child user ID must be an integer."}
        ])

    # Admin can specify the parent; a parent always links to themselves
    if g.user["role"] == "admin" and data.get("parent_user_id"):
        parent_id = data["parent_user_id"]
        parent = User.query.get(parent_id)
        if not parent or parent.role != "parent":
            return api_response.bad_request("Specified user is not a parent.")
    else:
        parent_id = g.user["id"]

    child = User.query.get(child_user_id)
    if not child or child.role != "player":
        return api_response.bad_request("Child must be an existing user with the player role.")

    existing = ParentChildLink.query.filter_by(
        parent_user_id=parent_id, child_user_id=child_user_id
    ).first()
    if existing:
        return api_response.conflict("This parent-child link already exists.")

    link = ParentChildLink(parent_user_id=parent_id, child_user_id=child_user_id)
    db.session.add(link)
    db.session.commit()
    return api_response.created(link.to_dict(), "Parent-child link created successfully.")


@parent_child_bp.route("/", methods=["GET"])
@authenticate
@authorize("parent", "admin")
def get_children():
    if g.user["role"] == "admin":
        links = ParentChildLink.query.all()
    else:
        links = ParentChildLink.query.filter_by(parent_user_id=g.user["id"]).all()
    result = []
    for link in links:
        d = link.to_dict()
        child = User.query.get(link.child_user_id)
        parent = User.query.get(link.parent_user_id)
        if child:
            d["child"] = {"id": child.id, "full_name": child.full_name, "email": child.email, "role": child.role}
        if parent:
            d["parent"] = {"id": parent.id, "full_name": parent.full_name, "email": parent.email}
        result.append(d)
    return api_response.success(result)


@parent_child_bp.route("/<int:link_id>", methods=["DELETE"])
@authenticate
@authorize("parent", "admin")
def unlink_child(link_id):
    link = ParentChildLink.query.get(link_id)
    if not link:
        return api_response.not_found("Link not found.")
    if g.user["role"] == "parent" and link.parent_user_id != g.user["id"]:
        return api_response.forbidden("You can only remove your own links.")
    db.session.delete(link)
    db.session.commit()
    return api_response.success(None, "Parent-child link removed.")
