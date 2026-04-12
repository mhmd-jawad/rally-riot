"""Team management routes."""
from flask import Blueprint, request, g

import api_response
from auth import authenticate, authorize
from models import Team, TeamCoach, TeamPlayer, User
from extensions import db

team_bp = Blueprint("teams", __name__)


@team_bp.route("/", methods=["POST"])
@authenticate
@authorize("admin")
def create_team():
    data = request.get_json(silent=True) or {}
    if not data.get("name", "").strip():
        return api_response.bad_request("Validation failed.", [
            {"field": "name", "message": "Team name is required."}
        ])

    if Team.query.filter_by(name=data["name"].strip()).first():
        return api_response.conflict("A team with this name already exists.")

    team = Team(
        name=data["name"].strip(),
        age_group=data.get("age_group"),
        skill_level=data.get("skill_level"),
    )
    db.session.add(team)
    db.session.commit()
    return api_response.created(team.to_dict(), "Team created successfully.")


@team_bp.route("/", methods=["GET"])
@authenticate
def list_teams():
    teams = Team.query.all()
    return api_response.success([t.to_dict(include_members=True) for t in teams])


@team_bp.route("/my", methods=["GET"])
@authenticate
def my_teams():
    """Return only the teams the authenticated coach is assigned to."""
    user_id = g.user["id"]
    role = g.user["role"]
    if role == "coach":
        assignments = TeamCoach.query.filter_by(coach_user_id=user_id).all()
        team_ids = [a.team_id for a in assignments]
        teams = Team.query.filter(Team.id.in_(team_ids)).all()
    elif role == "player":
        assignments = TeamPlayer.query.filter_by(player_user_id=user_id).all()
        team_ids = [a.team_id for a in assignments]
        teams = Team.query.filter(Team.id.in_(team_ids)).all()
    else:
        # admin sees all
        teams = Team.query.all()
    return api_response.success([t.to_dict(include_members=True) for t in teams])


@team_bp.route("/<int:team_id>", methods=["GET"])
@authenticate
def get_team(team_id):
    team = Team.query.get(team_id)
    if not team:
        return api_response.not_found("Team not found.")
    return api_response.success(team.to_dict(include_members=True))


@team_bp.route("/<int:team_id>/coaches", methods=["POST"])
@authenticate
@authorize("admin")
def assign_coach(team_id):
    team = Team.query.get(team_id)
    if not team:
        return api_response.not_found("Team not found.")

    data = request.get_json(silent=True) or {}
    coach_id = data.get("coach_user_id")
    if not coach_id:
        return api_response.bad_request("Validation failed.", [
            {"field": "coach_user_id", "message": "Coach user ID is required."}
        ])

    coach = User.query.get(coach_id)
    if not coach or coach.role != "coach":
        return api_response.bad_request("User is not a coach.")

    existing = TeamCoach.query.filter_by(team_id=team_id, coach_user_id=coach_id).first()
    if existing:
        return api_response.conflict("Coach is already assigned to this team.")

    tc = TeamCoach(team_id=team_id, coach_user_id=coach_id)
    db.session.add(tc)
    db.session.commit()
    return api_response.created(
        {"team_id": team_id, "coach_user_id": coach_id},
        "Coach assigned to team.",
    )


@team_bp.route("/<int:team_id>/players", methods=["POST"])
@authenticate
@authorize("admin")
def assign_player(team_id):
    team = Team.query.get(team_id)
    if not team:
        return api_response.not_found("Team not found.")

    data = request.get_json(silent=True) or {}
    player_id = data.get("player_user_id")
    if not player_id:
        return api_response.bad_request("Validation failed.", [
            {"field": "player_user_id", "message": "Player user ID is required."}
        ])

    player = User.query.get(player_id)
    if not player or player.role != "player":
        return api_response.bad_request("User is not a player.")

    existing = TeamPlayer.query.filter_by(team_id=team_id, player_user_id=player_id).first()
    if existing:
        return api_response.conflict("Player is already assigned to this team.")

    tp = TeamPlayer(team_id=team_id, player_user_id=player_id)
    db.session.add(tp)
    db.session.commit()
    return api_response.created(
        {"team_id": team_id, "player_user_id": player_id},
        "Player assigned to team.",
    )
