"""AI Chat Assistant — OpenAI function calling with full role coverage."""
import json
import logging
import re
from datetime import datetime, timedelta

from flask import Blueprint, request, g, current_app

import api_response
from auth import authenticate
from models import (
    Event, Team, TeamCoach, TeamPlayer, ParentChildLink,
    Invoice, AttendanceRecord, RSVP, Announcement, Registration, User,
    BlockedDate,
)
from extensions import db
from services import OverlapService, NotificationService

logger = logging.getLogger(__name__)
ai_bp = Blueprint("ai", __name__)
VALID_EVENT_TYPES = ("practice", "match", "tryout", "tournament")
EVENT_WRITE_TOOL_NAMES = {"book_event", "reschedule_event", "delete_event"}
ADMIN_CONFIRMATION_TOOL_NAMES = EVENT_WRITE_TOOL_NAMES


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
    parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=None)


def _find_blocked_date_for_range(start_dt, end_dt):
    current = start_dt.date()
    end_date = end_dt.date()
    while current <= end_date:
        current_iso = current.isoformat()
        blocked = BlockedDate.query.filter(
            BlockedDate.start_date <= current_iso,
            BlockedDate.end_date >= current_iso,
        ).first()
        if blocked:
            return blocked
        current += timedelta(days=1)
    return None


def _suggest_alternative_slots(
    court,
    team_id,
    duration_minutes,
    preferred_start=None,
    coach_user_id=None,
    exclude_event_id=None,
    limit=6,
):
    if not court:
        return []
    try:
        team_id = int(team_id)
        duration = max(30, int(duration_minutes or 60))
    except (TypeError, ValueError):
        return []

    if isinstance(preferred_start, str):
        try:
            preferred_start = _parse_dt(preferred_start)
        except (TypeError, ValueError):
            preferred_start = None
    preferred_start = preferred_start or datetime.utcnow()
    base_date = preferred_start.date()
    now = datetime.utcnow()
    slots = []

    for day_offset in range(7):
        day = base_date + timedelta(days=day_offset)
        slot = datetime.combine(day, datetime.min.time()).replace(hour=8)
        close_time = slot.replace(hour=20)
        while slot + timedelta(minutes=duration) <= close_time and len(slots) < limit:
            slot_end = slot + timedelta(minutes=duration)
            if (
                slot >= now
                and not _find_blocked_date_for_range(slot, slot_end)
                and not OverlapService.check_conflicts(
                    court=court,
                    team_id=team_id,
                    coach_user_id=coach_user_id,
                    start_time=slot,
                    end_time=slot_end,
                    exclude_event_id=exclude_event_id,
                )
            ):
                slots.append({"start_time": slot.isoformat(), "end_time": slot_end.isoformat()})
            slot += timedelta(minutes=30)
        if len(slots) >= limit:
            break

    return slots


def _conflict_response_with_alternatives(
    conflict,
    court,
    team_id,
    start,
    end,
    coach_user_id,
    exclude_event_id=None,
):
    duration_minutes = max(30, int((end - start).total_seconds() // 60))
    alternatives = _suggest_alternative_slots(
        court=court,
        team_id=team_id,
        duration_minutes=duration_minutes,
        preferred_start=start,
        coach_user_id=coach_user_id,
        exclude_event_id=exclude_event_id,
    )
    message = conflict.get("message", "Requested time is unavailable.")
    return {
        "error": f"Requested time is unavailable. {message}",
        "conflict": conflict,
        "alternative_slots": alternatives,
        "hint": (
            "Use one of the alternative_slots for the booking."
            if alternatives
            else "No alternative slot was found in the next 7 days."
        ),
    }


def _event_write_action(tool_name, result):
    if not isinstance(result, dict) or not result.get("success"):
        return None
    event = result.get("event")
    if tool_name == "book_event" and event:
        return {"type": "event_created", "tool": tool_name, "event_id": event.get("id")}
    if tool_name == "reschedule_event" and event:
        return {"type": "event_updated", "tool": tool_name, "event_id": event.get("id")}
    if tool_name == "delete_event":
        return {"type": "event_deleted", "tool": tool_name, "event_id": result.get("event_id")}
    return None


def _latest_user_text(messages):
    for message in reversed(messages):
        if isinstance(message, dict) and message.get("role") == "user":
            return str(message.get("content") or "")
    return ""


def _looks_like_event_write_intent(text):
    lowered = text.lower()
    patterns = (
        r"\b(book|reserve)\b",
        r"\b(create|add|set up)\b.*\b(event|practice|match|tryout|tournament|session|booking|court)\b",
        r"\bschedule\s+(?:a|an|the|this|that)?\s*(event|practice|match|tryout|tournament|session|booking|court)\b",
        r"\b(reschedule|move)\b.*\b(event|practice|match|tryout|tournament|session|booking|time)\b",
        r"\bchange\b.*\b(event|practice|match|tryout|tournament|session|booking|time)\b",
        r"\b(cancel|delete)\b.*\b(event|practice|match|tryout|tournament|session|booking)\b",
    )
    return any(re.search(pattern, lowered) for pattern in patterns)


def _schedule_permission_message(role):
    return (
        f"Your role ({role}) cannot book, reschedule, or cancel events through RallyBot. "
        "Only admins and coaches can modify the schedule."
    )


def _is_confirmation_acceptance(text):
    lowered = text.strip().lower()
    return lowered in {"confirm", "yes", "y", "proceed", "approve", "do it"} or lowered.startswith("confirm ")


def _is_confirmation_rejection(text):
    lowered = text.strip().lower()
    return lowered in {"cancel", "no", "n", "stop", "never mind", "nevermind"} or lowered.startswith("cancel ")


def _format_dt_for_confirmation(value):
    try:
        parsed = _parse_dt(value) if isinstance(value, str) else value
        if parsed:
            return parsed.strftime("%b %d, %Y at %I:%M %p").replace(" 0", " ")
    except (TypeError, ValueError):
        pass
    return str(value or "unspecified time")


def _admin_confirmation_required(user, tool_name):
    return user.get("role") == "admin" and tool_name in ADMIN_CONFIRMATION_TOOL_NAMES


def _build_admin_confirmation(tool_name, inputs):
    inputs = dict(inputs or {})
    if tool_name == "book_event":
        team = Team.query.get(inputs.get("team_id")) if inputs.get("team_id") else None
        summary = (
            f"Confirm booking '{inputs.get('title', 'Untitled event')}' for "
            f"{team.name if team else 'team ' + str(inputs.get('team_id', '?'))} on "
            f"{inputs.get('court', 'an unspecified court')} from "
            f"{_format_dt_for_confirmation(inputs.get('start_time'))} to "
            f"{_format_dt_for_confirmation(inputs.get('end_time'))}."
        )
    elif tool_name == "reschedule_event":
        event = Event.query.get(inputs.get("event_id")) if inputs.get("event_id") else None
        summary = (
            f"Confirm rescheduling '{event.title if event else 'event ' + str(inputs.get('event_id', '?'))}'"
            f"{' to ' + inputs['court'] if inputs.get('court') else ''}"
            f"{' from ' + _format_dt_for_confirmation(inputs['start_time']) if inputs.get('start_time') else ''}"
            f"{' to ' + _format_dt_for_confirmation(inputs['end_time']) if inputs.get('end_time') else ''}."
        )
    elif tool_name == "delete_event":
        event = Event.query.get(inputs.get("event_id")) if inputs.get("event_id") else None
        if event:
            summary = (
                f"Confirm cancellation of '{event.title}' on {event.court} from "
                f"{_format_dt_for_confirmation(event.start_time)} to "
                f"{_format_dt_for_confirmation(event.end_time)}."
            )
        else:
            summary = f"Confirm cancellation of event {inputs.get('event_id', '?')}."
    else:
        summary = f"Confirm {tool_name}."

    return {
        "tool": tool_name,
        "inputs": inputs,
        "summary": summary,
    }


def _format_alternative_slots(slots):
    if not slots:
        return ""
    lines = []
    for idx, slot in enumerate(slots[:3], start=1):
        lines.append(
            f"{idx}. {_format_dt_for_confirmation(slot.get('start_time'))} - "
            f"{_format_dt_for_confirmation(slot.get('end_time'))}"
        )
    return "\n".join(lines)


def _event_tool_reply(tool_name, result):
    if result.get("success"):
        event = result.get("event") or {}
        if tool_name == "book_event":
            return (
                f"Confirmed. Booked '{event.get('title', 'the event')}' on "
                f"{event.get('court', 'the court')} from "
                f"{_format_dt_for_confirmation(event.get('start_time'))} to "
                f"{_format_dt_for_confirmation(event.get('end_time'))}."
            )
        if tool_name == "reschedule_event":
            return (
                f"Confirmed. Rescheduled '{event.get('title', 'the event')}' to "
                f"{event.get('court', 'the court')} from "
                f"{_format_dt_for_confirmation(event.get('start_time'))} to "
                f"{_format_dt_for_confirmation(event.get('end_time'))}."
            )
        if tool_name == "delete_event":
            return "Confirmed. The event was cancelled."
        return result.get("message", "Confirmed. The action was completed.")

    if result.get("conflict"):
        reply = result.get("error", "Requested time is unavailable.")
        alternatives = _format_alternative_slots(result.get("alternative_slots") or [])
        if alternatives:
            reply += f"\n\nAvailable alternatives:\n{alternatives}"
        return reply

    return result.get("error", "I could not complete that request.")


def _claims_event_write_success(text):
    lowered = text.lower()
    return any(phrase in lowered for phrase in (
        "successfully booked", "has been booked", "is booked", "i've booked", "i have booked",
        "successfully scheduled", "has been scheduled", "is scheduled", "i've scheduled", "i have scheduled",
        "successfully reserved", "has been reserved", "is reserved", "i've reserved", "i have reserved",
        "successfully created", "has been created", "i've created", "i have created",
        "successfully rescheduled", "has been rescheduled", "is rescheduled", "i've rescheduled", "i have rescheduled",
        "successfully moved", "has been moved", "i've moved", "i have moved",
        "successfully updated", "has been updated", "i've updated", "i have updated",
    ))


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
        try:
            team_id = int(inputs.get("team_id"))
        except (TypeError, ValueError):
            return {"error": "team_id is required and must be an integer."}
        team = Team.query.get(team_id)
        if not team:
            return {"error": f"Team {team_id} not found."}
        event_type = inputs.get("event_type", "practice")
        if event_type not in VALID_EVENT_TYPES:
            return {"error": f"event_type must be one of {', '.join(VALID_EVENT_TYPES)}."}
        title = (inputs.get("title") or "").strip()
        if not title:
            return {"error": "title is required."}
        court   = (inputs.get("court") or "").strip()
        if not court:
            return {"error": "court is required."}
        if role == "coach" and not TeamCoach.query.filter_by(team_id=team_id, coach_user_id=uid).first():
            return {"error": f"You are not assigned as coach for team {team_id}."}
        try:
            start = _parse_dt(inputs["start_time"])
            end   = _parse_dt(inputs["end_time"])
        except (KeyError, TypeError, ValueError):
            return {"error": "Invalid datetime. Use ISO 8601."}
        if start >= end:
            return {"error": "start_time must be before end_time."}
        blocked = _find_blocked_date_for_range(start, end)
        if blocked:
            return {
                "error": (
                    f"Reservations are disabled on blocked dates. Conflicts with '{blocked.label}' "
                    f"({blocked.block_type}) from {blocked.start_date} to {blocked.end_date}."
                )
            }
        conflict = OverlapService.check_conflicts(court=court, team_id=team_id,
                                                  coach_user_id=uid, start_time=start, end_time=end)
        displaced_event_info = None
        if conflict:
            if conflict["type"] == "court":
                incoming_priority = team.priority_level if team else 1
                conflicting_priority = conflict.get("conflicting_team_priority", 1)
                if incoming_priority > conflicting_priority:
                    conflicting_event = Event.query.get(conflict["conflicting_event_id"])
                    if conflicting_event:
                        displaced_event_info = {
                            "displaced_event_id": conflicting_event.id,
                            "displaced_event_title": conflicting_event.title,
                            "displaced_team_id": conflicting_event.team_id,
                            "incoming_priority": incoming_priority,
                            "displaced_priority": conflicting_priority,
                        }
                        OverlapService.displace_event(
                            conflicting_event,
                            "Court booking displaced by higher-priority team",
                            (
                                f"Your event '{conflicting_event.title}' on "
                                f"{conflicting_event.start_time.strftime('%b %d at %H:%M')} at "
                                f"{conflicting_event.court} was displaced by '{title}' "
                                f"(priority {incoming_priority} > {conflicting_priority}). Please reschedule."
                            ),
                        )
                else:
                    return _conflict_response_with_alternatives(
                        conflict, court, team_id, start, end, uid
                    )
            else:
                return _conflict_response_with_alternatives(
                    conflict, court, team_id, start, end, uid
                )
        evt = Event(
            team_id=team_id, created_by_user_id=uid,
            event_type=event_type,
            title=title,
            description=inputs.get("description"),
            court=court, start_time=start, end_time=end,
        )
        db.session.add(evt)
        db.session.commit()
        logger.info("AI book_event: created event %d (user %d)", evt.id, uid)
        result = {"success": True, "event": evt.to_dict(include_relations=True)}
        if displaced_event_info:
            result["displaced"] = displaced_event_info
        return result

    # ── reschedule_event ───────────────────────────────────────
    if name == "reschedule_event":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can reschedule events."}
        evt = Event.query.get(inputs.get("event_id"))
        if not evt:
            return {"error": "Event not found."}
        if role == "coach" and not TeamCoach.query.filter_by(team_id=evt.team_id, coach_user_id=uid).first():
            return {"error": "You are not the coach of this team."}
        old_duration = evt.end_time - evt.start_time
        has_new_start = bool(inputs.get("start_time"))
        has_new_end = bool(inputs.get("end_time"))
        try:
            new_start = _parse_dt(inputs.get("start_time")) if has_new_start else evt.start_time
            new_end = _parse_dt(inputs.get("end_time")) if has_new_end else None
        except (TypeError, ValueError):
            return {"error": "Invalid datetime. Use ISO 8601."}
        if has_new_start and not has_new_end:
            new_end = new_start + old_duration
        elif not new_end:
            new_end = evt.end_time
        new_court = (inputs.get("court") or evt.court).strip()
        if new_start >= new_end:
            return {"error": "start_time must be before end_time."}
        blocked = _find_blocked_date_for_range(new_start, new_end)
        if blocked:
            return {
                "error": (
                    f"Reservations are disabled on blocked dates. Conflicts with '{blocked.label}' "
                    f"({blocked.block_type}) from {blocked.start_date} to {blocked.end_date}."
                )
            }
        conflict = OverlapService.check_conflicts(court=new_court, team_id=evt.team_id,
                                                  coach_user_id=evt.created_by_user_id,
                                                  start_time=new_start, end_time=new_end,
                                                  exclude_event_id=evt.id)
        displaced_event_info = None
        if conflict:
            if conflict["type"] == "court":
                incoming_team = Team.query.get(evt.team_id)
                incoming_priority = incoming_team.priority_level if incoming_team else 1
                conflicting_priority = conflict.get("conflicting_team_priority", 1)
                if incoming_priority > conflicting_priority:
                    conflicting_event = Event.query.get(conflict["conflicting_event_id"])
                    if conflicting_event:
                        displaced_event_info = {
                            "displaced_event_id": conflicting_event.id,
                            "displaced_event_title": conflicting_event.title,
                            "displaced_team_id": conflicting_event.team_id,
                            "incoming_priority": incoming_priority,
                            "displaced_priority": conflicting_priority,
                        }
                        OverlapService.displace_event(
                            conflicting_event,
                            "Court booking displaced by higher-priority team",
                            (
                                f"Your event '{conflicting_event.title}' on "
                                f"{conflicting_event.start_time.strftime('%b %d at %H:%M')} at "
                                f"{conflicting_event.court} was displaced by '{evt.title}' "
                                f"(priority {incoming_priority} > {conflicting_priority}). Please reschedule."
                            ),
                        )
                else:
                    return _conflict_response_with_alternatives(
                        conflict, new_court, evt.team_id, new_start, new_end, evt.created_by_user_id,
                        exclude_event_id=evt.id,
                    )
            else:
                return _conflict_response_with_alternatives(
                    conflict, new_court, evt.team_id, new_start, new_end, evt.created_by_user_id,
                    exclude_event_id=evt.id,
                )
        if has_new_start:
            evt.start_time = new_start
        if has_new_start or has_new_end:
            evt.end_time = new_end
        if inputs.get("court"):
            evt.court = new_court
        player_ids = [tp.player_user_id for tp in TeamPlayer.query.filter_by(team_id=evt.team_id).all()]
        if player_ids:
            NotificationService.notify_many(player_ids, "schedule_change",
                                            f"Event '{evt.title}' has been rescheduled.")
        db.session.commit()
        logger.info("AI reschedule_event: updated event %d (user %d)", evt.id, uid)
        result = {"success": True, "event": evt.to_dict(include_relations=True)}
        if displaced_event_info:
            result["displaced"] = displaced_event_info
        return result

    # ── get_alternative_slots ──────────────────────────────────
    if name == "get_alternative_slots":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can search booking alternatives."}
        court = (inputs.get("court") or "").strip()
        if not court:
            return {"error": "court is required."}
        try:
            team_id = int(inputs.get("team_id"))
            duration = int(inputs.get("duration_minutes", 60))
        except (TypeError, ValueError):
            return {"error": "team_id and duration_minutes must be valid numbers."}
        if not Team.query.get(team_id):
            return {"error": f"Team {team_id} not found."}
        if role == "coach" and not TeamCoach.query.filter_by(team_id=team_id, coach_user_id=uid).first():
            return {"error": f"You are not assigned as coach for team {team_id}."}
        preferred = inputs.get("preferred_date", datetime.utcnow().strftime("%Y-%m-%d"))
        try:
            base = datetime.fromisoformat(preferred).replace(hour=8, minute=0, second=0, microsecond=0)
        except Exception:
            base = datetime.utcnow().replace(hour=8, minute=0, second=0, microsecond=0)
        slots = _suggest_alternative_slots(
            court=court,
            team_id=team_id,
            duration_minutes=duration,
            preferred_start=base,
            coach_user_id=uid,
        )
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
        event_id = evt.id
        db.session.delete(evt)
        db.session.commit()
        return {"success": True, "event_id": event_id, "message": f"Event '{title}' has been deleted."}

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
        "Never pretend to perform an action without a successful tool call.\n"
        "9. Only admins and coaches may book, reschedule, or cancel events. Parents and players must be told "
        "that only admins and coaches can modify the schedule.\n"
        "10. Admin booking, rescheduling, and cancellation requests require confirmation before execution. "
        "Ask the admin to confirm when the system requests it; do not claim the change happened before confirmation.\n\n"
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
    data     = request.get_json(silent=True) or {}
    messages = data.get("messages")
    if not messages or not isinstance(messages, list):
        return api_response.bad_request("'messages' array is required.")

    user = g.user
    tools = _TOOLS_BY_ROLE.get(user["role"], [])
    if not tools:
        return api_response.bad_request("AI chat is not available for your role.")

    latest_user_text = _latest_user_text(messages)
    tool_results = []
    write_actions = []

    def response_payload(reply, pending_confirmation=None):
        payload = {
            "reply": reply,
            "role": "assistant",
            "tool_results": tool_results,
            "write_actions": write_actions,
        }
        if pending_confirmation:
            payload["pending_confirmation"] = pending_confirmation
        return payload

    if user["role"] not in ("coach", "admin") and _looks_like_event_write_intent(latest_user_text):
        return api_response.success(response_payload(_schedule_permission_message(user["role"])))

    pending_confirmation = data.get("pending_confirmation")
    if pending_confirmation:
        if user["role"] != "admin":
            return api_response.success(response_payload(_schedule_permission_message(user["role"])))
        tool_name = pending_confirmation.get("tool")
        inputs = pending_confirmation.get("inputs") or {}
        if tool_name not in ADMIN_CONFIRMATION_TOOL_NAMES:
            return api_response.success(response_payload("That pending confirmation is not a schedule action. No changes were made."))
        if _is_confirmation_rejection(latest_user_text):
            return api_response.success(response_payload("Cancelled. No schedule changes were made."))
        if not _is_confirmation_acceptance(latest_user_text):
            return api_response.success(response_payload(
                "Please reply 'confirm' to execute this schedule change, or 'cancel' to leave it unchanged.",
                pending_confirmation,
            ))

        result = _execute_tool(tool_name, inputs, user)
        tool_results.append({"tool": tool_name, "result": result})
        action = _event_write_action(tool_name, result)
        if action:
            write_actions.append(action)
        return api_response.success(response_payload(_event_tool_reply(tool_name, result)))

    try:
        from openai import OpenAI
    except ImportError:
        return api_response.server_error("openai package not installed.")

    api_key = current_app.config.get("OPENAI_API_KEY", "")
    if not api_key:
        return api_response.server_error("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=api_key)
    model = current_app.config.get("OPENAI_MODEL", "gpt-4o-mini")
    oai_messages = [{"role": "system", "content": _system_prompt(user)}] + list(messages)

    for iteration in range(10):
        response = client.chat.completions.create(model=model, tools=tools, messages=oai_messages)
        choice   = response.choices[0]
        logger.debug("AI iter=%d finish=%s user=%d", iteration, choice.finish_reason, user["id"])

        if choice.finish_reason == "stop":
            reply = choice.message.content or ""
            event_write_succeeded = any(
                action.get("type") in ("event_created", "event_updated", "event_deleted")
                for action in write_actions
            )
            if (
                _looks_like_event_write_intent(latest_user_text)
                and _claims_event_write_success(reply)
                and not event_write_succeeded
            ):
                reply = (
                    "I could not complete that scheduling request. No event was created or changed. "
                    "Please include the team, court, start time, and end time, then try again."
                )
            return api_response.success(response_payload(reply))

        if choice.finish_reason == "tool_calls":
            oai_messages.append(choice.message)
            for tc in choice.message.tool_calls:
                logger.info("AI tool=%s user=%d", tc.function.name, user["id"])
                try:
                    inp = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    inp = {}
                if _admin_confirmation_required(user, tc.function.name):
                    pending = _build_admin_confirmation(tc.function.name, inp)
                    result = {
                        "confirmation_required": True,
                        "tool": tc.function.name,
                        "message": pending["summary"],
                    }
                    tool_results.append({"tool": tc.function.name, "result": result})
                    return api_response.success(response_payload(
                        f"{pending['summary']}\n\nReply 'confirm' to execute it, or 'cancel' to leave the schedule unchanged.",
                        pending,
                    ))
                result = _execute_tool(tc.function.name, inp, user)
                tool_results.append({"tool": tc.function.name, "result": result})
                action = _event_write_action(tc.function.name, result)
                if action:
                    write_actions.append(action)
                oai_messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result)})
            continue
        break

    reply = getattr(choice.message, "content", None) or "I could not complete that request. Please try again."
    return api_response.success(response_payload(reply))
