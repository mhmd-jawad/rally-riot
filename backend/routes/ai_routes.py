"""AI Chat Assistant routes — natural language interface backed by OpenAI with function calling."""
import json
import logging
from datetime import datetime, timedelta

from flask import Blueprint, request, g, current_app

import api_response
from auth import authenticate
from models import Event, Team, TeamCoach, TeamPlayer, ParentChildLink, Invoice
from extensions import db
from services import OverlapService, NotificationService

logger = logging.getLogger(__name__)

ai_bp = Blueprint("ai", __name__)


# ── Tool definitions (OpenAI function format) ──────────────────────────────────

_COACH_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_teams",
            "description": "Get the list of teams the coach is assigned to.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_events",
            "description": "Get the coach's upcoming events / schedule.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_event",
            "description": (
                "Create a new event / court booking for a team. "
                "If there is a scheduling conflict, automatically call get_alternative_slots "
                "to suggest available times to the user."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "team_id": {"type": "integer", "description": "Team ID"},
                    "event_type": {
                        "type": "string",
                        "enum": ["practice", "match", "tryout", "tournament"],
                    },
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "court": {"type": "string", "description": "Court name or location"},
                    "start_time": {"type": "string", "description": "ISO 8601, e.g. 2025-05-01T14:00:00"},
                    "end_time": {"type": "string", "description": "ISO 8601, e.g. 2025-05-01T16:00:00"},
                },
                "required": ["team_id", "event_type", "title", "court", "start_time", "end_time"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reschedule_event",
            "description": (
                "Reschedule an existing event by changing its start/end time and/or court. "
                "If there is a conflict at the new time, automatically call get_alternative_slots."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "integer"},
                    "start_time": {"type": "string", "description": "New ISO 8601 start time"},
                    "end_time": {"type": "string", "description": "New ISO 8601 end time"},
                    "court": {"type": "string", "description": "New court (optional)"},
                },
                "required": ["event_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_alternative_slots",
            "description": (
                "Find available time slots for a court + team combination. "
                "Call this whenever book_event or reschedule_event returns a conflict."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "court": {"type": "string"},
                    "team_id": {"type": "integer"},
                    "duration_minutes": {"type": "integer", "description": "Length of the event in minutes"},
                    "preferred_date": {"type": "string", "description": "YYYY-MM-DD date to search around"},
                },
                "required": ["court", "team_id", "duration_minutes", "preferred_date"],
            },
        },
    },
]

_PARENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_child_schedule",
            "description": "Get upcoming events / schedule for the parent's linked child/children.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_balance",
            "description": "Check the parent's invoice balance, outstanding amounts, and payment due dates.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

_TOOLS_BY_ROLE = {
    "coach": _COACH_TOOLS,
    "parent": _PARENT_TOOLS,
    "admin": _COACH_TOOLS + _PARENT_TOOLS,
}


# ── Tool execution ─────────────────────────────────────────────────────────────

def _parse_dt(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _execute_tool(name, inputs, user):
    """Dispatch a tool call and return a JSON-serialisable result dict."""
    uid = user["id"]
    role = user["role"]

    # ── get_teams ──────────────────────────────────────────────
    if name == "get_teams":
        if role == "coach":
            memberships = TeamCoach.query.filter_by(coach_user_id=uid).all()
            ids = [m.team_id for m in memberships]
            teams = Team.query.filter(Team.id.in_(ids)).all()
        else:
            teams = Team.query.all()
        return {"teams": [t.to_dict() for t in teams]}

    # ── get_my_events ──────────────────────────────────────────
    if name == "get_my_events":
        if role == "coach":
            memberships = TeamCoach.query.filter_by(coach_user_id=uid).all()
            team_ids = [m.team_id for m in memberships]
        else:
            team_ids = [t.id for t in Team.query.all()]

        if not team_ids:
            return {"events": []}

        evts = (
            Event.query
            .filter(Event.team_id.in_(team_ids), Event.start_time >= datetime.utcnow())
            .order_by(Event.start_time.asc())
            .limit(20)
            .all()
        )
        return {"events": [e.to_dict(include_relations=True) for e in evts]}

    # ── book_event ─────────────────────────────────────────────
    if name == "book_event":
        if role not in ("coach", "admin"):
            return {"error": "Only coaches and admins can create events."}

        team_id = inputs.get("team_id")
        court = (inputs.get("court") or "").strip()

        if role == "coach":
            if not TeamCoach.query.filter_by(team_id=team_id, coach_user_id=uid).first():
                return {"error": f"You are not assigned as a coach for team {team_id}."}

        try:
            start = _parse_dt(inputs["start_time"])
            end = _parse_dt(inputs["end_time"])
        except Exception:
            return {"error": "Invalid datetime. Use ISO 8601, e.g. 2025-05-01T14:00:00"}

        if start >= end:
            return {"error": "start_time must be before end_time."}

        conflict = OverlapService.check_conflicts(
            court=court, team_id=team_id, coach_user_id=uid,
            start_time=start, end_time=end,
        )
        if conflict:
            return {
                "conflict": conflict,
                "hint": "Call get_alternative_slots to find open time slots.",
            }

        evt = Event(
            team_id=team_id,
            created_by_user_id=uid,
            event_type=inputs.get("event_type", "practice"),
            title=(inputs.get("title") or "").strip(),
            description=inputs.get("description"),
            court=court,
            start_time=start,
            end_time=end,
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
            return {"error": f"Event {inputs.get('event_id')} not found."}

        if role == "coach":
            if not TeamCoach.query.filter_by(team_id=evt.team_id, coach_user_id=uid).first():
                return {"error": "You are not assigned as a coach for this team."}

        new_start = _parse_dt(inputs.get("start_time")) or evt.start_time
        new_end = _parse_dt(inputs.get("end_time")) or evt.end_time
        new_court = inputs.get("court") or evt.court

        if new_start >= new_end:
            return {"error": "start_time must be before end_time."}

        conflict = OverlapService.check_conflicts(
            court=new_court, team_id=evt.team_id, coach_user_id=evt.created_by_user_id,
            start_time=new_start, end_time=new_end, exclude_event_id=evt.id,
        )
        if conflict:
            return {
                "conflict": conflict,
                "hint": "Call get_alternative_slots to find open time slots.",
            }

        if inputs.get("start_time"):
            evt.start_time = new_start
        if inputs.get("end_time"):
            evt.end_time = new_end
        if inputs.get("court"):
            evt.court = new_court

        player_ids = [tp.player_user_id for tp in TeamPlayer.query.filter_by(team_id=evt.team_id).all()]
        if player_ids:
            NotificationService.notify_many(
                player_ids, "schedule_change",
                f"Event '{evt.title}' has been rescheduled.",
            )

        db.session.commit()
        logger.info("AI reschedule_event: updated event %d (user %d)", evt.id, uid)
        return {"success": True, "event": evt.to_dict(include_relations=True)}

    # ── get_alternative_slots ──────────────────────────────────
    if name == "get_alternative_slots":
        court = inputs.get("court", "")
        team_id = inputs.get("team_id")
        duration = int(inputs.get("duration_minutes", 60))
        preferred = inputs.get("preferred_date", datetime.utcnow().strftime("%Y-%m-%d"))

        try:
            base = datetime.fromisoformat(preferred).replace(hour=8, minute=0, second=0, microsecond=0)
        except Exception:
            base = datetime.utcnow().replace(hour=8, minute=0, second=0, microsecond=0)

        slots = []
        for day_offset in range(5):
            slot = base + timedelta(days=day_offset)
            while slot.hour < 20 and len(slots) < 5:
                slot_end = slot + timedelta(minutes=duration)
                if not OverlapService.check_conflicts(
                    court=court, team_id=team_id, coach_user_id=uid,
                    start_time=slot, end_time=slot_end,
                ):
                    slots.append({
                        "start_time": slot.isoformat(),
                        "end_time": slot_end.isoformat(),
                    })
                slot += timedelta(hours=1)

        return {"available_slots": slots, "court": court, "duration_minutes": duration}

    # ── get_child_schedule ─────────────────────────────────────
    if name == "get_child_schedule":
        if role not in ("parent", "admin"):
            return {"error": "Permission denied."}

        links = ParentChildLink.query.filter_by(parent_user_id=uid).all()
        child_ids = [l.child_user_id for l in links]
        if not child_ids:
            return {"schedule": [], "note": "No children are linked to your account."}

        team_ids = list({m.team_id for m in TeamPlayer.query.filter(TeamPlayer.player_user_id.in_(child_ids)).all()})
        if not team_ids:
            return {"schedule": [], "note": "Your child is not assigned to any team yet."}

        evts = (
            Event.query
            .filter(Event.team_id.in_(team_ids), Event.start_time >= datetime.utcnow())
            .order_by(Event.start_time.asc())
            .limit(20)
            .all()
        )
        return {"schedule": [e.to_dict(include_relations=True) for e in evts]}

    # ── check_balance ──────────────────────────────────────────
    if name == "check_balance":
        if role not in ("parent", "admin"):
            return {"error": "Permission denied."}

        invoices = Invoice.query.filter_by(parent_user_id=uid).all()
        total_outstanding = sum(max(float(i.amount) - float(i.amount_paid), 0.0) for i in invoices)
        unpaid = [i.to_dict(include_relations=True) for i in invoices if i.status == "unpaid"]
        paid = [i.to_dict(include_relations=True) for i in invoices if i.status == "paid"]

        return {
            "total_outstanding": round(total_outstanding, 2),
            "unpaid_invoices": unpaid,
            "paid_invoices": paid,
            "summary": f"You have {len(unpaid)} unpaid invoice(s) totalling ${total_outstanding:.2f}.",
        }

    return {"error": f"Unknown tool: {name}"}


# ── System prompt ──────────────────────────────────────────────────────────────

def _system_prompt(user):
    role = user["role"]
    name = user.get("full_name", "User")
    today = datetime.utcnow().strftime("%A, %B %d, %Y")

    base = (
        f"You are RallyBot, an AI assistant for RallyRiot — a volleyball club management platform.\n"
        f"You are helping {name}, who has the role: {role}.\n"
        f"Today is {today}.\n\n"
        "Be concise and professional. Format lists and schedules clearly.\n"
        "Never attempt actions outside the user's role permissions.\n"
        "When you encounter a scheduling conflict, immediately call get_alternative_slots "
        "and present the alternatives to the user.\n"
    )

    if role == "coach":
        base += (
            "\nAs a coach you can:\n"
            "- Book courts / create events for your assigned teams (book_event)\n"
            "- Reschedule existing events (reschedule_event)\n"
            "- View your schedule (get_my_events)\n"
            "- Get suggested alternative slots on conflict (get_alternative_slots)\n"
            "- List your teams (get_teams)\n\n"
            "Always confirm key details before creating or rescheduling. "
            "On any scheduling conflict, suggest alternatives automatically.\n"
        )
    elif role == "parent":
        base += (
            "\nAs a parent you can:\n"
            "- View your child's upcoming schedule (get_child_schedule)\n"
            "- Check your outstanding balance and due dates (check_balance)\n\n"
            "You cannot create or modify events.\n"
        )
    elif role == "admin":
        base += "\nAs an admin you have access to all coach and parent tools.\n"

    return base


# ── Chat endpoint ──────────────────────────────────────────────────────────────

@ai_bp.route("/chat", methods=["POST"])
@authenticate
def chat():
    """Run a multi-turn AI conversation with OpenAI function calling."""
    try:
        from openai import OpenAI
    except ImportError:
        logger.error("openai package not installed")
        return api_response.server_error("AI service dependencies are missing.")

    data = request.get_json(silent=True) or {}
    messages = data.get("messages")
    if not messages or not isinstance(messages, list):
        return api_response.bad_request("'messages' array is required.")

    user = g.user
    tools = _TOOLS_BY_ROLE.get(user["role"], [])
    if not tools:
        return api_response.bad_request("AI chat is not available for your role.")

    api_key = current_app.config.get("OPENAI_API_KEY", "")
    if not api_key:
        logger.error("OPENAI_API_KEY is not configured")
        return api_response.server_error("AI service is not configured. Set OPENAI_API_KEY.")

    model = current_app.config.get("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)
    system = _system_prompt(user)

    # Prepend system message in OpenAI format
    oai_messages = [{"role": "system", "content": system}] + list(messages)

    # Agentic loop — run until finish_reason is "stop" or max iterations
    for iteration in range(10):
        response = client.chat.completions.create(
            model=model,
            tools=tools,
            messages=oai_messages,
        )
        choice = response.choices[0]
        logger.debug(
            "AI chat iteration %d finish_reason=%s user=%d",
            iteration, choice.finish_reason, user["id"],
        )

        if choice.finish_reason == "stop":
            return api_response.success({"reply": choice.message.content, "role": "assistant"})

        if choice.finish_reason == "tool_calls":
            # Append assistant message (with tool_calls) to history
            oai_messages.append(choice.message)

            # Execute each tool call and append results
            for tc in choice.message.tool_calls:
                logger.info("AI tool_call: %s (user %d)", tc.function.name, user["id"])
                try:
                    inputs = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    inputs = {}
                result = _execute_tool(tc.function.name, inputs, user)
                oai_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })
            continue

        # Unexpected finish_reason
        break

    reply = choice.message.content or "I was unable to complete that request. Please try again."
    return api_response.success({"reply": reply, "role": "assistant"})
