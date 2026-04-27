"""RSVP and Attendance routes."""
from flask import Blueprint, request, g

import api_response
from auth import authenticate, authorize
from models import RSVP, AttendanceRecord, Event, Team, TeamCoach, TeamPlayer, ParentChildLink, User
from extensions import db

rsvp_bp = Blueprint("rsvps", __name__)
attendance_bp = Blueprint("attendance", __name__)

VALID_RSVP = ("attending", "not_attending", "maybe")
VALID_ATTENDANCE = ("present", "absent")


def _coach_can_access_event(event):
    if g.user["role"] == "admin":
        return True
    assignment = TeamCoach.query.filter_by(team_id=event.team_id, coach_user_id=g.user["id"]).first()
    return assignment is not None


# ── RSVP ────────────────────────────────────────────────────────

@rsvp_bp.route("/", methods=["POST"])
@authenticate
@authorize("player", "parent")
def upsert_rsvp():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("event_id"):
        errors.append({"field": "event_id", "message": "Event ID must be an integer."})
    if not data.get("player_user_id"):
        errors.append({"field": "player_user_id", "message": "Player user ID must be an integer."})
    if data.get("status") not in VALID_RSVP:
        errors.append({"field": "status", "message": "Status must be attending, not_attending, or maybe."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    event = Event.query.get(data["event_id"])
    if not event:
        return api_response.not_found("Event not found.")

    player_id = data["player_user_id"]
    user_id = g.user["id"]
    user_role = g.user["role"]

    # Players can only RSVP for themselves
    if user_role == "player" and player_id != user_id:
        return api_response.forbidden("You can only RSVP for yourself.")

    # Parents can RSVP for their children
    if user_role == "parent":
        link = ParentChildLink.query.filter_by(parent_user_id=user_id, child_user_id=player_id).first()
        if not link:
            return api_response.forbidden("You can only RSVP for your children.")

    # Verify player is on the team
    on_team = TeamPlayer.query.filter_by(team_id=event.team_id, player_user_id=player_id).first()
    if not on_team:
        return api_response.bad_request("Player is not a member of this team.")

    absence_reason = data.get("absence_reason") if data.get("status") == "not_attending" else None

    existing = RSVP.query.filter_by(event_id=data["event_id"], player_user_id=player_id).first()
    if existing:
        existing.status = data["status"]
        existing.responded_by_user_id = user_id
        existing.absence_reason = absence_reason
        db.session.commit()
        return api_response.success(existing.to_dict(), "RSVP updated.")
    else:
        rsvp = RSVP(
            event_id=data["event_id"],
            player_user_id=player_id,
            responded_by_user_id=user_id,
            status=data["status"],
            absence_reason=absence_reason,
        )
        db.session.add(rsvp)
        db.session.commit()
        return api_response.created(rsvp.to_dict(), "RSVP recorded.")


@rsvp_bp.route("/coach", methods=["POST"])
@authenticate
@authorize("coach", "admin")
def coach_upsert_rsvp():
    """Coach assigns or removes a player from an event lineup."""
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("event_id"):
        errors.append({"field": "event_id", "message": "Event ID is required."})
    if not data.get("player_user_id"):
        errors.append({"field": "player_user_id", "message": "Player user ID is required."})
    if data.get("status") not in VALID_RSVP:
        errors.append({"field": "status", "message": "Status must be attending, not_attending, or maybe."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    event = Event.query.get(data["event_id"])
    if not event:
        return api_response.not_found("Event not found.")

    if g.user["role"] == "coach":
        assignment = TeamCoach.query.filter_by(team_id=event.team_id, coach_user_id=g.user["id"]).first()
        if not assignment:
            return api_response.forbidden("You are not a coach for this team.")

    player_id = data["player_user_id"]
    on_team = TeamPlayer.query.filter_by(team_id=event.team_id, player_user_id=player_id).first()
    if not on_team:
        return api_response.bad_request("Player is not a member of this team.")

    existing = RSVP.query.filter_by(event_id=data["event_id"], player_user_id=player_id).first()
    if existing:
        existing.status = data["status"]
        existing.responded_by_user_id = g.user["id"]
        db.session.commit()
        return api_response.success(existing.to_dict(), "RSVP updated.")

    rsvp = RSVP(
        event_id=data["event_id"],
        player_user_id=player_id,
        responded_by_user_id=g.user["id"],
        status=data["status"],
    )
    db.session.add(rsvp)
    db.session.commit()
    return api_response.created(rsvp.to_dict(), "RSVP recorded.")


@rsvp_bp.route("/event/<int:event_id>", methods=["GET"])
@authenticate
@authorize("admin", "coach")
def get_rsvps_for_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return api_response.not_found("Event not found.")
    if not _coach_can_access_event(event):
        return api_response.forbidden("You do not have access to this event.")
    rsvps = RSVP.query.filter_by(event_id=event_id).all()
    return api_response.success([r.to_dict() for r in rsvps])


# ── Attendance ──────────────────────────────────────────────────

@attendance_bp.route("/", methods=["POST"])
@authenticate
@authorize("coach", "admin")
def mark_attendance():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("event_id"):
        errors.append({"field": "event_id", "message": "Event ID must be an integer."})
    if not data.get("player_user_id"):
        errors.append({"field": "player_user_id", "message": "Player user ID must be an integer."})
    if data.get("status") not in VALID_ATTENDANCE:
        errors.append({"field": "status", "message": "Status must be present or absent."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    event = Event.query.get(data["event_id"])
    if not event:
        return api_response.not_found("Event not found.")

    # Verify coach is assigned to team
    if g.user["role"] == "coach":
        assignment = TeamCoach.query.filter_by(team_id=event.team_id, coach_user_id=g.user["id"]).first()
        if not assignment:
            return api_response.forbidden("You are not a coach for this team.")

    on_team = TeamPlayer.query.filter_by(team_id=event.team_id, player_user_id=data["player_user_id"]).first()
    if not on_team:
        return api_response.bad_request("Player is not a member of this team.")

    existing = AttendanceRecord.query.filter_by(
        event_id=data["event_id"], player_user_id=data["player_user_id"]
    ).first()

    absence_reason = data.get("absence_reason") if data.get("status") == "absent" else None

    if existing:
        existing.status = data["status"]
        existing.marked_by_user_id = g.user["id"]
        existing.absence_reason = absence_reason
        db.session.commit()
        return api_response.success(existing.to_dict(), "Attendance updated.")
    else:
        record = AttendanceRecord(
            event_id=data["event_id"],
            player_user_id=data["player_user_id"],
            marked_by_user_id=g.user["id"],
            status=data["status"],
            absence_reason=absence_reason,
        )
        db.session.add(record)
        db.session.commit()
        return api_response.created(record.to_dict(), "Attendance marked.")


@attendance_bp.route("/event/<int:event_id>", methods=["GET"])
@authenticate
@authorize("admin", "coach")
def get_attendance_for_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return api_response.not_found("Event not found.")
    if not _coach_can_access_event(event):
        return api_response.forbidden("You do not have access to this event.")
    records = AttendanceRecord.query.filter_by(event_id=event_id).all()
    return api_response.success([r.to_dict() for r in records])


@attendance_bp.route("/summary", methods=["GET"])
@authenticate
@authorize("admin", "coach")
def attendance_summary():
    """Aggregate attendance per player, optionally filtered by team."""
    team_id = request.args.get("team_id", type=int)

    # Build base query of attendance records joined to events
    records = (
        db.session.query(AttendanceRecord, Event)
        .join(Event, AttendanceRecord.event_id == Event.id)
    )
    if team_id:
        records = records.filter(Event.team_id == team_id)
    elif g.user["role"] == "coach":
        # coaches only see their teams
        assignments = TeamCoach.query.filter_by(coach_user_id=g.user["id"]).all()
        coach_team_ids = [a.team_id for a in assignments]
        records = records.filter(Event.team_id.in_(coach_team_ids))

    records = records.all()

    # Aggregate per player
    player_stats: dict = {}
    for rec, event in records:
        pid = rec.player_user_id
        if pid not in player_stats:
            player = User.query.get(pid)
            player_stats[pid] = {
                "player_id": pid,
                "player_name": player.full_name if player else f"Player #{pid}",
                "team_id": event.team_id,
                "present": 0,
                "absent": 0,
                "total": 0,
                "absence_reasons": [],
            }
        player_stats[pid]["total"] += 1
        if rec.status == "present":
            player_stats[pid]["present"] += 1
        else:
            player_stats[pid]["absent"] += 1
            if rec.absence_reason:
                player_stats[pid]["absence_reasons"].append({
                    "event_id": event.id,
                    "event_title": event.title,
                    "date": event.start_time.strftime("%Y-%m-%d") if event.start_time else None,
                    "reason": rec.absence_reason,
                })

    # Attach team names and attendance rate
    team_cache: dict = {}
    rows = []
    for stats in player_stats.values():
        tid = stats["team_id"]
        if tid not in team_cache:
            team = Team.query.get(tid)
            team_cache[tid] = team.name if team else f"Team #{tid}"
        stats["team_name"] = team_cache[tid]
        stats["attendance_rate"] = (
            round(stats["present"] / stats["total"] * 100, 1) if stats["total"] > 0 else 0.0
        )
        rows.append(stats)

    rows.sort(key=lambda x: (-x["attendance_rate"], x["player_name"]))
    return api_response.success(rows)
