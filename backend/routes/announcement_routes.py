"""Announcement routes."""
from flask import Blueprint, request, g

import api_response
from auth import authenticate, authorize
from models import Announcement, Team, TeamCoach, TeamPlayer
from extensions import db
from services import NotificationService

announcement_bp = Blueprint("announcements", __name__)


@announcement_bp.route("/", methods=["POST"])
@authenticate
@authorize("coach", "admin")
def create_announcement():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("team_id"):
        errors.append({"field": "team_id", "message": "Team ID is required."})
    if not data.get("title") or not str(data.get("title", "")).strip():
        errors.append({"field": "title", "message": "Title is required."})
    if not data.get("message") or not str(data.get("message", "")).strip():
        errors.append({"field": "message", "message": "Message is required."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    team = Team.query.get(data["team_id"])
    if not team:
        return api_response.not_found("Team not found.")

    # Coaches must be assigned to the team
    if g.user["role"] == "coach":
        assignment = TeamCoach.query.filter_by(team_id=team.id, coach_user_id=g.user["id"]).first()
        if not assignment:
            return api_response.forbidden("You are not a coach for this team.")

    ann = Announcement(
        team_id=data["team_id"],
        coach_user_id=g.user["id"],
        title=data["title"].strip(),
        message=data["message"].strip(),
        priority=data.get("priority", "normal"),
    )
    db.session.add(ann)
    db.session.commit()

    # Notify all players on the team
    players = TeamPlayer.query.filter_by(team_id=team.id).all()
    player_ids = [p.player_user_id for p in players]
    if player_ids:
        NotificationService.notify_many(
            player_ids,
            "announcement",
            f"New announcement for {team.name}: {ann.title}",
        )

    return api_response.created(ann.to_dict(), "Announcement created.")


@announcement_bp.route("/", methods=["GET"])
@authenticate
def list_announcements():
    team_id = request.args.get("team_id", type=int)
    query = Announcement.query

    if team_id:
        query = query.filter_by(team_id=team_id)

    # Players only see announcements for their teams
    if g.user["role"] == "player":
        memberships = TeamPlayer.query.filter_by(player_user_id=g.user["id"]).all()
        team_ids = [m.team_id for m in memberships]
        query = query.filter(Announcement.team_id.in_(team_ids))

    anns = query.order_by(Announcement.created_at.desc()).all()
    return api_response.success([a.to_dict() for a in anns])


@announcement_bp.route("/<int:announcement_id>", methods=["GET"])
@authenticate
def get_announcement(announcement_id):
    ann = Announcement.query.get(announcement_id)
    if not ann:
        return api_response.not_found("Announcement not found.")
    return api_response.success(ann.to_dict())
