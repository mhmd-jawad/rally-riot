"""AI Chat Assistant — OpenAI function calling with full role coverage."""
import json
import logging
from datetime import datetime, timedelta

from flask import Blueprint, request, g, current_app

import api_response
from auth import authenticate
from models import (
    Event, Team, TeamCoach, TeamPlayer, ParentChildLink,
    Invoice, AttendanceRecord, RSVP, Announcement, Registration, User,
)
from extensions import db
from services import OverlapService, NotificationService

logger = logging.getLogger(__name__)
ai_bp = Blueprint("ai", __name__)


# ─────────────────────────────────────────────────────────────────────────────
# Tool definitions
# ─────────────────────────────────────────────────────────────────────────────

def _tool(name, description, properties=None, required=None):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties or {},
                "required": required or [],
            },
        },
    }


# ── Shared ────────────────────────────────────────────────────────────────────
_T_GET_ANNOUNCEMENTS = _tool(
    "get_announcements",
    "Get announcements posted to the user's teams. Call this when asked about news, updates, or announcements.",
)

# ── Coach / Admin ─────────────────────────────────────────────────────────────
_T_GET_COURTS = _tool(
    "get_courts",
    "List all courts in the club. Optionally pass a time window to see which are free.",
    {
        "check_time_start": {"type": "string", "description": "ISO 8601 start (optional)"},
        "check_time_end":   {"type": "string", "description": "ISO 8601 end (optional)"},
    },
)
_T_GET_TEAMS = _tool(
    "get_teams",
    "Get the teams the coach manages (or all teams for admin).",
)
_T_GET_MY_EVENTS = _tool(
    "get_my_events",
    "Get upcoming events for the coach's teams.",
)
_T_GET_TEAM_PLAYERS = _tool(
    "get_team_players",
    "Get the roster (player list) for a specific team.",
    {"team_id": {"type": "integer", "description": "Team ID"}},
    ["team_id"],
)
_T_GET_EVENT_RSVPS = _tool(
    "get_event_rsvps",
    "Get all RSVPs for a specific event. Call this when a coach asks who is attending an event.",
    {"event_id": {"type": "integer"}},
    ["event_id"],
)
_T_GET_EVENT_ATTENDANCE = _tool(
    "get_event_attendance",
    "Get attendance records for a specific event.",
    {"event_id": {"type": "integer"}},
    ["event_id"],
)
_T_CREATE_ANNOUNCEMENT = _tool(
    "create_announcement",
    "Post a new announcement to a team.",
    {
        "team_id": {"type": "integer"},
        "title":   {"type": "string"},
        "message": {"type": "string"},
    },
    ["team_id", "title", "message"],
)
_T_BOOK_EVENT = _tool(
    "book_event",
    "Create a new event / court booking. If there is a conflict, call get_alternative_slots automatically.",
    {
        "team_id":    {"type": "integer"},
        "event_type": {"type": "string", "enum": ["practice", "match", "tryout", "tournament"]},
        "title":      {"type": "string"},
        "description":{"type": "string"},
        "court":      {"type": "string"},
        "start_time": {"type": "string", "description": "ISO 8601"},
        "end_time":   {"type": "string", "description": "ISO 8601"},
    },
    ["team_id", "event_type", "title", "court", "start_time", "end_time"],
)
_T_RESCHEDULE_EVENT = _tool(
    "reschedule_event",
    "Move an existing event to a new time or court. If conflict, call get_alternative_slots.",
    {
        "event_id":   {"type": "integer"},
        "start_time": {"type": "string"},
        "end_time":   {"type": "string"},
        "court":      {"type": "string"},
    },
    ["event_id"],
)
_T_GET_ALT_SLOTS = _tool(
    "get_alternative_slots",
    "Find free time slots for a court + team. Call this whenever book_event or reschedule_event returns a conflict.",
    {
        "court":            {"type": "string"},
        "team_id":          {"type": "integer"},
        "duration_minutes": {"type": "integer"},
        "preferred_date":   {"type": "string", "description": "YYYY-MM-DD"},
    },
    ["court", "team_id", "duration_minutes", "preferred_date"],
)

# ── Parent ────────────────────────────────────────────────────────────────────
_T_GET_CHILD_SCHEDULE = _tool(
    "get_child_schedule",
    "Get upcoming events for the parent's linked children.",
)
_T_GET_MY_CHILDREN = _tool(
    "get_my_children",
    "List the children linked to this parent account with their team assignments.",
)
_T_CHECK_BALANCE = _tool(
    "check_balance",
    "Get invoice balance, outstanding amounts, and payment due dates.",
)

# ── Player ────────────────────────────────────────────────────────────────────
_T_GET_MY_SCHEDULE = _tool(
    "get_my_schedule",
    "Get the player's upcoming events based on their team membership.",
)
_T_GET_MY_TEAM = _tool(
    "get_my_team",
    "Get info about the team(s) the player belongs to, including coach names.",
)
_T_RSVP_EVENT = _tool(
    "rsvp_event",
    "RSVP to an event as attending, not_attending, or maybe.",
    {
        "event_id": {"type": "integer"},
        "status":   {"type": "string", "enum": ["attending", "not_attending", "maybe"]},
    },
    ["event_id", "status"],
)
_T_GET_MY_ATTENDANCE = _tool(
    "get_my_attendance",
    "Get the player's own attendance history across all events.",
)

# ── Coach / Admin write ───────────────────────────────────────────────────────
_T_ADD_PLAYER_TO_TEAM = _tool(
    "add_player_to_team",
    "Add a player to a team. Use list_users(role='player') first to find the player's ID.",
    {
        "team_id":        {"type": "integer"},
        "player_user_id": {"type": "integer"},
    },
    ["team_id", "player_user_id"],
)
_T_REMOVE_PLAYER_FROM_TEAM = _tool(
    "remove_player_from_team",
    "Remove a player from a team.",
    {
        "team_id":        {"type": "integer"},
        "player_user_id": {"type": "integer"},
    },
    ["team_id", "player_user_id"],
)
_T_DELETE_EVENT = _tool(
    "delete_event",
    "Delete / cancel an event. Use get_my_events first to find the event ID.",
    {"event_id": {"type": "integer"}},
    ["event_id"],
)

# ── Admin ─────────────────────────────────────────────────────────────────────
_T_LIST_USERS = _tool(
    "list_users",
    "List all users in the club. Optionally filter by role.",
    {"role": {"type": "string", "enum": ["admin", "coach", "player", "parent"]}},
)
_T_LIST_REGISTRATIONS = _tool(
    "list_registrations",
    "List registration submissions. Optionally filter by status (pending, approved, rejected).",
    {"status": {"type": "string", "enum": ["pending", "approved", "rejected"]}},
)
_T_UPDATE_REGISTRATION_STATUS = _tool(
    "update_registration_status",
    "Approve or reject a registration submission.",
    {
        "registration_id": {"type": "integer"},
        "status":          {"type": "string", "enum": ["approved", "rejected"]},
    },
    ["registration_id", "status"],
)


_COACH_TOOLS = [
    _T_GET_COURTS, _T_GET_TEAMS, _T_GET_MY_EVENTS,
    _T_GET_TEAM_PLAYERS, _T_GET_EVENT_RSVPS, _T_GET_EVENT_ATTENDANCE,
    _T_CREATE_ANNOUNCEMENT, _T_GET_ANNOUNCEMENTS,
    _T_BOOK_EVENT, _T_RESCHEDULE_EVENT, _T_DELETE_EVENT, _T_GET_ALT_SLOTS,
    _T_ADD_PLAYER_TO_TEAM, _T_REMOVE_PLAYER_FROM_TEAM,
]
_PARENT_TOOLS = [
    _T_GET_CHILD_SCHEDULE, _T_GET_MY_CHILDREN,
    _T_CHECK_BALANCE, _T_GET_ANNOUNCEMENTS,
]
_PLAYER_TOOLS = [
    _T_GET_MY_SCHEDULE, _T_GET_MY_TEAM,
    _T_RSVP_EVENT, _T_GET_MY_ATTENDANCE, _T_GET_ANNOUNCEMENTS,
]
_ADMIN_TOOLS = _COACH_TOOLS + [
    _T_GET_CHILD_SCHEDULE, _T_GET_MY_CHILDREN,
    _T_CHECK_BALANCE, _T_LIST_USERS, _T_LIST_REGISTRATIONS,
    _T_UPDATE_REGISTRATION_STATUS,
]

_TOOLS_BY_ROLE = {
    "coach":  _COACH_TOOLS,
    "parent": _PARENT_TOOLS,
    "player": _PLAYER_TOOLS,
    "admin":  _ADMIN_TOOLS,
}


# ─────────────────────────────────────────────────────────────────────────────
# Tool execution
# ─────────────────────────────────────────────────────────────────────────────

def _parse_dt(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _execute_tool(name, inputs, user):
    uid  = user["id"]
    role = user["role"]

    # ── get_courts ─────────────────────────────────────────────
    if name == "get_courts":
        rows = db.session.query(Event.court).distinct().all()
        courts = sorted({r[0] for r in rows if r[0]})
        if not courts:
            return {"courts": [], "note": "No courts recorded yet."}
        check_start = _parse_dt(inputs.get("check_time_start"))
        check_end   = _parse_dt(inputs.get("check_time_end"))
        if check_start and check_end:
            result = []
            for court in courts:
                conflict = Event.query.filter(
                    Event.court == court,
                    Event.start_time < check_end,
                    Event.end_time   > check_start,
                ).first()
                result.append({"court": court, "available": conflict is None,
                                "conflict_event": conflict.title if conflict else None})
            return {"courts": result, "window": f"{check_start.isoformat()} – {check_end.isoformat()}"}
        return {"courts": courts}

    # ── get_teams ──────────────────────────────────────────────
    if name == "get_teams":
        if role == "coach":
            ids = [m.team_id for m in TeamCoach.query.filter_by(coach_user_id=uid).all()]
            teams = Team.query.filter(Team.id.in_(ids)).all()
        else:
            teams = Team.query.all()
        return {"teams": [t.to_dict(include_members=True) for t in teams]}

    # ── get_my_events ──────────────────────────────────────────
    if name == "get_my_events":
        if role == "coach":
            team_ids = [m.team_id for m in TeamCoach.query.filter_by(coach_user_id=uid).all()]
        else:
            team_ids = [t.id for t in Team.query.all()]
        if not team_ids:
            return {"events": []}
        evts = (Event.query
                .filter(Event.team_id.in_(team_ids), Event.start_time >= datetime.utcnow())
                .order_by(Event.start_time.asc()).limit(20).all())
        return {"events": [e.to_dict(include_relations=True) for e in evts]}

    # ── get_team_players ───────────────────────────────────────
    if name == "get_team_players":
        team_id = inputs.get("team_id")
        if role == "coach" and not TeamCoach.query.filter_by(team_id=team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        players = TeamPlayer.query.filter_by(team_id=team_id).all()
        user_ids = [p.player_user_id for p in players]
        users = User.query.filter(User.id.in_(user_ids)).all()
        return {"team_id": team_id, "players": [u.to_public() for u in users]}

    # ── get_event_rsvps ────────────────────────────────────────
    if name == "get_event_rsvps":
        event_id = inputs.get("event_id")
        evt = Event.query.get(event_id)
        if not evt:
            return {"error": f"Event {event_id} not found."}
        if role == "coach" and not TeamCoach.query.filter_by(team_id=evt.team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        rsvps = RSVP.query.filter_by(event_id=event_id).all()
        return {
            "event": evt.title,
            "rsvps": [r.to_dict() for r in rsvps],
            "summary": {
                "attending":     sum(1 for r in rsvps if r.status == "attending"),
                "not_attending": sum(1 for r in rsvps if r.status == "not_attending"),
                "maybe":         sum(1 for r in rsvps if r.status == "maybe"),
            },
        }

    # ── get_event_attendance ───────────────────────────────────
    if name == "get_event_attendance":
        event_id = inputs.get("event_id")
        evt = Event.query.get(event_id)
        if not evt:
            return {"error": f"Event {event_id} not found."}
        if role == "coach" and not TeamCoach.query.filter_by(team_id=evt.team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        records = AttendanceRecord.query.filter_by(event_id=event_id).all()
        return {
            "event": evt.title,
            "attendance": [r.to_dict() for r in records],
            "summary": {
                "present": sum(1 for r in records if r.status == "present"),
                "absent":  sum(1 for r in records if r.status == "absent"),
            },
        }

    # ── create_announcement ────────────────────────────────────
    if name == "create_announcement":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can post announcements."}
        team_id = inputs.get("team_id")
        if role == "coach" and not TeamCoach.query.filter_by(team_id=team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        ann = Announcement(
            team_id=team_id,
            coach_user_id=uid,
            title=inputs.get("title", "").strip(),
            message=inputs.get("message", "").strip(),
        )
        db.session.add(ann)
        player_ids = [tp.player_user_id for tp in TeamPlayer.query.filter_by(team_id=team_id).all()]
        if player_ids:
            NotificationService.notify_many(player_ids, "announcement", ann.title)
        db.session.commit()
        return {"success": True, "announcement": ann.to_dict()}

    # ── get_announcements ──────────────────────────────────────
    if name == "get_announcements":
        if role == "coach":
            team_ids = [m.team_id for m in TeamCoach.query.filter_by(coach_user_id=uid).all()]
        elif role == "player":
            team_ids = [m.team_id for m in TeamPlayer.query.filter_by(player_user_id=uid).all()]
        elif role == "parent":
            child_ids = [l.child_user_id for l in ParentChildLink.query.filter_by(parent_user_id=uid).all()]
            team_ids  = list({m.team_id for m in TeamPlayer.query.filter(TeamPlayer.player_user_id.in_(child_ids)).all()})
        else:
            team_ids = [t.id for t in Team.query.all()]
        anns = (Announcement.query
                .filter(Announcement.team_id.in_(team_ids))
                .order_by(Announcement.created_at.desc()).limit(20).all())
        return {"announcements": [a.to_dict() for a in anns]}

    # ── book_event ─────────────────────────────────────────────
    if name == "book_event":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can create events."}
        team_id = inputs.get("team_id")
        court   = (inputs.get("court") or "").strip()
        if role == "coach" and not TeamCoach.query.filter_by(team_id=team_id, coach_user_id=uid).first():
            return {"error": f"You are not assigned as coach for team {team_id}."}
        try:
            start = _parse_dt(inputs["start_time"])
            end   = _parse_dt(inputs["end_time"])
        except Exception:
            return {"error": "Invalid datetime. Use ISO 8601."}
        if start >= end:
            return {"error": "start_time must be before end_time."}
        conflict = OverlapService.check_conflicts(court=court, team_id=team_id,
                                                  coach_user_id=uid, start_time=start, end_time=end)
        if conflict:
            return {"conflict": conflict, "hint": "Call get_alternative_slots to find open time slots."}
        evt = Event(
            team_id=team_id, created_by_user_id=uid,
            event_type=inputs.get("event_type", "practice"),
            title=(inputs.get("title") or "").strip(),
            description=inputs.get("description"),
            court=court, start_time=start, end_time=end,
        )
        db.session.add(evt)
        db.session.commit()
        logger.info("AI book_event: created event %d (user %d)", evt.id, uid)
        return {"success": True, "event": evt.to_dict(include_relations=True)}

    # ── reschedule_event ───────────────────────────────────────
    if name == "reschedule_event":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can reschedule events."}
        evt = Event.query.get(inputs.get("event_id"))
        if not evt:
            return {"error": "Event not found."}
        if role == "coach" and not TeamCoach.query.filter_by(team_id=evt.team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        new_start = _parse_dt(inputs.get("start_time")) or evt.start_time
        new_end   = _parse_dt(inputs.get("end_time"))   or evt.end_time
        new_court = inputs.get("court") or evt.court
        if new_start >= new_end:
            return {"error": "start_time must be before end_time."}
        conflict = OverlapService.check_conflicts(court=new_court, team_id=evt.team_id,
                                                  coach_user_id=evt.created_by_user_id,
                                                  start_time=new_start, end_time=new_end,
                                                  exclude_event_id=evt.id)
        if conflict:
            return {"conflict": conflict, "hint": "Call get_alternative_slots to find open time slots."}
        if inputs.get("start_time"): evt.start_time = new_start
        if inputs.get("end_time"):   evt.end_time   = new_end
        if inputs.get("court"):      evt.court      = new_court
        player_ids = [tp.player_user_id for tp in TeamPlayer.query.filter_by(team_id=evt.team_id).all()]
        if player_ids:
            NotificationService.notify_many(player_ids, "schedule_change",
                                            f"Event '{evt.title}' has been rescheduled.")
        db.session.commit()
        logger.info("AI reschedule_event: updated event %d (user %d)", evt.id, uid)
        return {"success": True, "event": evt.to_dict(include_relations=True)}

    # ── get_alternative_slots ──────────────────────────────────
    if name == "get_alternative_slots":
        court    = inputs.get("court", "")
        team_id  = inputs.get("team_id")
        duration = int(inputs.get("duration_minutes", 60))
        preferred = inputs.get("preferred_date", datetime.utcnow().strftime("%Y-%m-%d"))
        try:
            base = datetime.fromisoformat(preferred).replace(hour=8, minute=0, second=0, microsecond=0)
        except Exception:
            base = datetime.utcnow().replace(hour=8, minute=0, second=0, microsecond=0)
        slots = []
        for day in range(7):
            slot = base + timedelta(days=day)
            while slot.hour < 20 and len(slots) < 6:
                slot_end = slot + timedelta(minutes=duration)
                if not OverlapService.check_conflicts(court=court, team_id=team_id,
                                                      coach_user_id=uid, start_time=slot, end_time=slot_end):
                    slots.append({"start_time": slot.isoformat(), "end_time": slot_end.isoformat()})
                slot += timedelta(hours=1)
        return {"available_slots": slots, "court": court, "duration_minutes": duration}

    # ── get_child_schedule ─────────────────────────────────────
    if name == "get_child_schedule":
        if role not in ("parent", "admin"):
            return {"error": "Permission denied."}
        links     = ParentChildLink.query.filter_by(parent_user_id=uid).all()
        child_ids = [l.child_user_id for l in links]
        if not child_ids:
            return {"schedule": [], "note": "No children linked to your account."}
        team_ids = list({m.team_id for m in TeamPlayer.query.filter(TeamPlayer.player_user_id.in_(child_ids)).all()})
        if not team_ids:
            return {"schedule": [], "note": "Your child is not on any team yet."}
        evts = (Event.query
                .filter(Event.team_id.in_(team_ids), Event.start_time >= datetime.utcnow())
                .order_by(Event.start_time.asc()).limit(20).all())
        return {"schedule": [e.to_dict(include_relations=True) for e in evts]}

    # ── get_my_children ────────────────────────────────────────
    if name == "get_my_children":
        if role not in ("parent", "admin"):
            return {"error": "Permission denied."}
        links = ParentChildLink.query.filter_by(parent_user_id=uid).all()
        result = []
        for link in links:
            child = User.query.get(link.child_user_id)
            if not child:
                continue
            memberships = TeamPlayer.query.filter_by(player_user_id=child.id).all()
            teams = [Team.query.get(m.team_id).to_dict() for m in memberships if Team.query.get(m.team_id)]
            result.append({"child": child.to_public(), "teams": teams})
        return {"children": result}

    # ── check_balance ──────────────────────────────────────────
    if name == "check_balance":
        if role not in ("parent", "admin"):
            return {"error": "Permission denied."}
        invoices = Invoice.query.all() if role == "admin" else Invoice.query.filter_by(parent_user_id=uid).all()
        total_outstanding = sum(max(float(i.amount) - float(i.amount_paid), 0.0) for i in invoices)
        unpaid = [i.to_dict(include_relations=True) for i in invoices if i.status == "unpaid"]
        paid   = [i.to_dict(include_relations=True) for i in invoices if i.status == "paid"]
        summary = (
            f"There are {len(unpaid)} unpaid invoice(s) totalling ${total_outstanding:.2f} club-wide."
            if role == "admin"
            else f"You have {len(unpaid)} unpaid invoice(s) totalling ${total_outstanding:.2f}."
        )
        return {"total_outstanding": round(total_outstanding, 2),
                "unpaid_invoices": unpaid, "paid_invoices": paid, "summary": summary}

    # ── get_my_schedule (player) ───────────────────────────────
    if name == "get_my_schedule":
        team_ids = [m.team_id for m in TeamPlayer.query.filter_by(player_user_id=uid).all()]
        if not team_ids:
            return {"schedule": [], "note": "You are not assigned to any team yet."}
        evts = (Event.query
                .filter(Event.team_id.in_(team_ids), Event.start_time >= datetime.utcnow())
                .order_by(Event.start_time.asc()).limit(20).all())
        rsvp_map = {r.event_id: r.status for r in RSVP.query.filter_by(player_user_id=uid).all()}
        schedule = []
        for e in evts:
            d = e.to_dict(include_relations=True)
            d["my_rsvp"] = rsvp_map.get(e.id, "no_response")
            schedule.append(d)
        return {"schedule": schedule}

    # ── get_my_team (player) ───────────────────────────────────
    if name == "get_my_team":
        memberships = TeamPlayer.query.filter_by(player_user_id=uid).all()
        if not memberships:
            return {"teams": [], "note": "You are not on any team."}
        result = []
        for m in memberships:
            team = Team.query.get(m.team_id)
            if not team:
                continue
            coaches = [User.query.get(c.coach_user_id).to_public()
                       for c in TeamCoach.query.filter_by(team_id=team.id).all()
                       if User.query.get(c.coach_user_id)]
            teammates = [User.query.get(p.player_user_id).to_public()
                         for p in TeamPlayer.query.filter_by(team_id=team.id).all()
                         if p.player_user_id != uid and User.query.get(p.player_user_id)]
            result.append({"team": team.to_dict(), "coaches": coaches, "teammates": teammates})
        return {"teams": result}

    # ── rsvp_event (player) ────────────────────────────────────
    if name == "rsvp_event":
        event_id = inputs.get("event_id")
        status   = inputs.get("status")
        evt = Event.query.get(event_id)
        if not evt:
            return {"error": f"Event {event_id} not found."}
        if not TeamPlayer.query.filter_by(team_id=evt.team_id, player_user_id=uid).first():
            return {"error": "You are not a member of this event's team."}
        existing = RSVP.query.filter_by(event_id=event_id, player_user_id=uid).first()
        if existing:
            existing.status = status
        else:
            db.session.add(RSVP(event_id=event_id, player_user_id=uid,
                                responded_by_user_id=uid, status=status))
        db.session.commit()
        return {"success": True, "event": evt.title, "rsvp_status": status}

    # ── get_my_attendance (player) ─────────────────────────────
    if name == "get_my_attendance":
        records = (AttendanceRecord.query
                   .filter_by(player_user_id=uid)
                   .order_by(AttendanceRecord.recorded_at.desc()).limit(30).all())
        present = sum(1 for r in records if r.status == "present")
        absent  = sum(1 for r in records if r.status == "absent")
        result  = []
        for r in records:
            d = r.to_dict()
            evt = Event.query.get(r.event_id)
            d["event_title"] = evt.title if evt else "Unknown"
            result.append(d)
        return {
            "attendance": result,
            "summary": {"present": present, "absent": absent,
                        "rate": f"{round(present / max(present+absent, 1) * 100)}%"},
        }

    # ── list_users (admin) ─────────────────────────────────────
    if name == "list_users":
        if role != "admin":
            return {"error": "Only admins can list users."}
        q = User.query
        if inputs.get("role"):
            q = q.filter_by(role=inputs["role"])
        users = q.order_by(User.full_name).all()
        return {"users": [u.to_dict() for u in users], "count": len(users)}

    # ── list_registrations (admin) ─────────────────────────────
    if name == "list_registrations":
        if role != "admin":
            return {"error": "Only admins can list registrations."}
        q = Registration.query
        if inputs.get("status"):
            q = q.filter_by(status=inputs["status"])
        regs = q.order_by(Registration.submitted_at.desc()).limit(50).all()
        return {"registrations": [r.to_dict(include_relations=True) for r in regs], "count": len(regs)}

    # ── add_player_to_team ─────────────────────────────────────
    if name == "add_player_to_team":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can add players to teams."}
        team_id = inputs.get("team_id")
        player_id = inputs.get("player_user_id")
        if role == "coach" and not TeamCoach.query.filter_by(team_id=team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        player = User.query.filter_by(id=player_id, role="player").first()
        if not player:
            return {"error": f"No player found with ID {player_id}."}
        if TeamPlayer.query.filter_by(team_id=team_id, player_user_id=player_id).first():
            return {"error": f"{player.full_name} is already on this team."}
        db.session.add(TeamPlayer(team_id=team_id, player_user_id=player_id))
        db.session.commit()
        team = Team.query.get(team_id)
        return {"success": True, "message": f"{player.full_name} has been added to {team.name}."}

    # ── remove_player_from_team ────────────────────────────────
    if name == "remove_player_from_team":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can remove players from teams."}
        team_id = inputs.get("team_id")
        player_id = inputs.get("player_user_id")
        if role == "coach" and not TeamCoach.query.filter_by(team_id=team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        membership = TeamPlayer.query.filter_by(team_id=team_id, player_user_id=player_id).first()
        if not membership:
            return {"error": "This player is not on this team."}
        db.session.delete(membership)
        db.session.commit()
        player = User.query.get(player_id)
        team   = Team.query.get(team_id)
        return {"success": True, "message": f"{player.full_name} has been removed from {team.name}."}

    # ── delete_event ───────────────────────────────────────────
    if name == "delete_event":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can delete events."}
        evt = Event.query.get(inputs.get("event_id"))
        if not evt:
            return {"error": "Event not found."}
        if role == "coach" and not TeamCoach.query.filter_by(team_id=evt.team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        title = evt.title
        db.session.delete(evt)
        db.session.commit()
        return {"success": True, "message": f"Event '{title}' has been deleted."}

    # ── update_registration_status ─────────────────────────────
    if name == "update_registration_status":
        if role != "admin":
            return {"error": "Only admins can update registration status."}
        reg = Registration.query.get(inputs.get("registration_id"))
        if not reg:
            return {"error": "Registration not found."}
        reg.status = inputs.get("status")
        db.session.commit()
        return {"success": True, "registration": reg.to_dict(include_relations=True)}

    return {"error": f"Unknown tool: {name}"}


# ─────────────────────────────────────────────────────────────────────────────
# System prompt
# ─────────────────────────────────────────────────────────────────────────────

def _system_prompt(user):
    role = user["role"]
    name = user.get("full_name", "User")
    today = datetime.utcnow().strftime("%A, %B %d, %Y")

    rules = (
        f"You are RallyBot, the AI assistant for RallyRiot volleyball club management.\n"
        f"You are helping {name} (role: {role}). Today is {today}.\n\n"
        "## RULES — never break these:\n"
        "1. ALWAYS call a tool to get real data before answering. Never say 'I don't have access' — use a tool.\n"
        "2. Never invent courts, events, players, balances, or any data. Only report what tools return.\n"
        "3. If a tool returns an empty list, say exactly that — don't guess or suggest alternatives from imagination.\n"
        "4. Format dates as human-readable ('Tuesday May 6 at 2:00 PM'). Format money with $.\n"
        "5. On scheduling conflict → call get_alternative_slots immediately and list the options.\n"
        "6. After any write action (booking, RSVP, announcement, add/remove player) confirm success "
        "with the exact details returned by the tool.\n"
        "7. CRITICAL: If a tool returns an 'error' field, you MUST tell the user the exact error. "
        "NEVER say an action was completed if the tool returned an error or if you did not call a tool.\n"
        "8. CRITICAL: If the user asks you to do something you have no tool for, say explicitly: "
        "'I don't have the ability to [action] through this chat. Please use the platform interface instead.' "
        "Never pretend to perform an action without a successful tool call.\n\n"
    )

    tool_docs = {
        "coach": (
            "## Your tools:\n"
            "- get_courts([time window]) → all club courts; pass times to see which are free\n"
            "- get_teams() → your assigned teams\n"
            "- get_my_events() → your upcoming events\n"
            "- get_team_players(team_id) → roster for a team\n"
            "- get_event_rsvps(event_id) → who RSVP'd to an event\n"
            "- get_event_attendance(event_id) → attendance record for an event\n"
            "- get_announcements() → recent announcements for your teams\n"
            "- create_announcement(team_id, title, message) → post to a team\n"
            "- book_event(team_id, event_type, title, court, start_time, end_time) → create event\n"
            "- reschedule_event(event_id, [start_time], [end_time], [court]) → move an event\n"
            "- delete_event(event_id) → cancel/delete an event\n"
            "- get_alternative_slots(court, team_id, duration_minutes, preferred_date) → free slots\n"
            "- add_player_to_team(team_id, player_user_id) → add a player to your team\n"
            "- remove_player_from_team(team_id, player_user_id) → remove a player from your team\n"
        ),
        "parent": (
            "## Your tools:\n"
            "- get_my_children() → your linked children and their teams\n"
            "- get_child_schedule() → upcoming events for your children\n"
            "- get_announcements() → announcements from your child's coach\n"
            "- check_balance() → your invoices, amounts due, due dates\n"
        ),
        "player": (
            "## Your tools:\n"
            "- get_my_team() → your team, coach, and teammates\n"
            "- get_my_schedule() → your upcoming events (includes your RSVP status)\n"
            "- get_announcements() → announcements from your coach\n"
            "- rsvp_event(event_id, status) → RSVP to an event (attending / not_attending / maybe)\n"
            "- get_my_attendance() → your attendance history and rate\n"
        ),
        "admin": (
            "## Your tools (full access):\n"
            "- get_courts, get_teams, get_my_events, get_team_players\n"
            "- get_event_rsvps, get_event_attendance, get_announcements, create_announcement\n"
            "- book_event, reschedule_event, delete_event, get_alternative_slots\n"
            "- add_player_to_team(team_id, player_user_id), remove_player_from_team(team_id, player_user_id)\n"
            "- get_my_children, get_child_schedule, check_balance\n"
            "- list_users([role]) → all club members, filterable by role\n"
            "- list_registrations([status]) → registration submissions\n"
            "- update_registration_status(registration_id, status) → approve or reject a registration\n"
        ),
    }

    return rules + tool_docs.get(role, "")


# ─────────────────────────────────────────────────────────────────────────────
# Chat endpoint
# ─────────────────────────────────────────────────────────────────────────────

@ai_bp.route("/chat", methods=["POST"])
@authenticate
def chat():
    try:
        from openai import OpenAI
    except ImportError:
        return api_response.server_error("openai package not installed.")

    data     = request.get_json(silent=True) or {}
    messages = data.get("messages")
    if not messages or not isinstance(messages, list):
        return api_response.bad_request("'messages' array is required.")

    user  = g.user
    tools = _TOOLS_BY_ROLE.get(user["role"], [])
    if not tools:
        return api_response.bad_request("AI chat is not available for your role.")

    api_key = current_app.config.get("OPENAI_API_KEY", "")
    if not api_key:
        return api_response.server_error("OPENAI_API_KEY is not configured.")

    client      = OpenAI(api_key=api_key)
    model       = current_app.config.get("OPENAI_MODEL", "gpt-4o-mini")
    oai_messages = [{"role": "system", "content": _system_prompt(user)}] + list(messages)

    for iteration in range(10):
        response = client.chat.completions.create(model=model, tools=tools, messages=oai_messages)
        choice   = response.choices[0]
        logger.debug("AI iter=%d finish=%s user=%d", iteration, choice.finish_reason, user["id"])

        if choice.finish_reason == "stop":
            return api_response.success({"reply": choice.message.content, "role": "assistant"})

        if choice.finish_reason == "tool_calls":
            oai_messages.append(choice.message)
            for tc in choice.message.tool_calls:
                logger.info("AI tool=%s user=%d", tc.function.name, user["id"])
                try:
                    inp = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    inp = {}
                result = _execute_tool(tc.function.name, inp, user)
                oai_messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result)})
            continue
        break

    reply = getattr(choice.message, "content", None) or "I could not complete that request. Please try again."
    return api_response.success({"reply": reply, "role": "assistant"})
