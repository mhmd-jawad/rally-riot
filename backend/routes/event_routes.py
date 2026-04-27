"""Event routes: CRUD, calendar, child schedule."""
from datetime import datetime, timedelta, date
from flask import Blueprint, request, g

import api_response
from auth import authenticate, authorize
from models import Event, RecurringEventRule, Team, TeamCoach, TeamPlayer, ParentChildLink, BlockedDate
from extensions import db
from services import OverlapService, NotificationService, paginate
from models import Team as TeamModel

event_bp = Blueprint("events", __name__)

VALID_EVENT_TYPES = ("practice", "match", "tryout", "tournament")


def _parse_dt(s):
    """Parse ISO datetime string to datetime object."""
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _find_blocked_date_for_range(start_dt, end_dt):
    """Return a blocking period if any day in [start_dt, end_dt] overlaps a blocked date."""
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


def _visible_team_ids():
    user_id = g.user["id"]
    role = g.user["role"]
    if role == "admin":
        return None
    if role == "coach":
        memberships = TeamCoach.query.filter_by(coach_user_id=user_id).all()
        return sorted({m.team_id for m in memberships})
    if role == "player":
        memberships = TeamPlayer.query.filter_by(player_user_id=user_id).all()
        return sorted({m.team_id for m in memberships})

    links = ParentChildLink.query.filter_by(parent_user_id=user_id).all()
    child_ids = [l.child_user_id for l in links]
    if not child_ids:
        return []
    memberships = TeamPlayer.query.filter(TeamPlayer.player_user_id.in_(child_ids)).all()
    return sorted({m.team_id for m in memberships})


@event_bp.route("/", methods=["POST"])
@authenticate
@authorize("coach", "admin")
def create_event():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("team_id"):
        errors.append({"field": "team_id", "message": "Team ID is required."})
    if data.get("event_type") not in VALID_EVENT_TYPES:
        errors.append({"field": "event_type", "message": f"Event type must be one of {', '.join(VALID_EVENT_TYPES)}."})
    if not data.get("title", "").strip():
        errors.append({"field": "title", "message": "Title is required."})
    if not data.get("court", "").strip():
        errors.append({"field": "court", "message": "Court / location is required."})
    if not data.get("start_time"):
        errors.append({"field": "start_time", "message": "Start time is required."})
    if not data.get("end_time"):
        errors.append({"field": "end_time", "message": "End time is required."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    start = _parse_dt(data["start_time"])
    end = _parse_dt(data["end_time"])
    if start >= end:
        return api_response.bad_request("Start time must be before end time.")

    blocked = _find_blocked_date_for_range(start, end)
    if blocked:
        return api_response.conflict(
            f"Reservations are disabled on blocked dates. Conflicts with '{blocked.label}' ({blocked.block_type}) "
            f"from {blocked.start_date} to {blocked.end_date}."
        )

    user_id = g.user["id"]

    # Verify coach is assigned to team
    if g.user["role"] == "coach":
        assignment = TeamCoach.query.filter_by(team_id=data["team_id"], coach_user_id=user_id).first()
        if not assignment:
            return api_response.forbidden("You are not assigned as a coach for this team.")

    # Check overlaps
    conflict = OverlapService.check_conflicts(
        court=data["court"],
        team_id=data["team_id"],
        coach_user_id=user_id,
        start_time=start,
        end_time=end,
    )

    displaced_event_info = None
    if conflict:
        # Only court conflicts can be resolved by priority — team/coach conflicts always block
        if conflict["type"] == "court":
            incoming_team = TeamModel.query.get(data["team_id"])
            incoming_priority = incoming_team.priority_level if incoming_team else 1
            conflicting_priority = conflict.get("conflicting_team_priority", 1)

            if incoming_priority > conflicting_priority:
                # Higher-priority team displaces the existing booking
                conflicting_event = Event.query.get(conflict["conflicting_event_id"])
                if conflicting_event:
                    displaced_event_info = {
                        "displaced_event_id": conflicting_event.id,
                        "displaced_event_title": conflicting_event.title,
                        "displaced_team_id": conflicting_event.team_id,
                        "displaced_team_name": conflict["message"].split("team: ")[1].split(",")[0] if "team: " in conflict["message"] else "?",
                        "incoming_priority": incoming_priority,
                        "displaced_priority": conflicting_priority,
                    }
                    reason_title = "Court booking displaced by higher-priority team"
                    reason_message = (
                        f"Your event '{conflicting_event.title}' on {conflicting_event.start_time.strftime('%b %d at %H:%M')} "
                        f"at {conflicting_event.court} was displaced by '{data['title'].strip()}' "
                        f"(priority {incoming_priority} > {conflicting_priority}). Please reschedule."
                    )
                    OverlapService.displace_event(conflicting_event, reason_title, reason_message)
            else:
                # Equal or lower priority — reject as before
                return api_response.conflict(conflict["message"], conflict)
        else:
            return api_response.conflict(conflict["message"], conflict)

    event = Event(
        team_id=data["team_id"],
        created_by_user_id=user_id,
        event_type=data["event_type"],
        title=data["title"].strip(),
        description=data.get("description"),
        court=data["court"].strip(),
        start_time=start,
        end_time=end,
    )
    db.session.add(event)
    db.session.commit()

    result = event.to_dict()
    if displaced_event_info:
        result["displaced"] = displaced_event_info
    msg = "Event created successfully."
    if displaced_event_info:
        msg = (
            f"Event created. '{displaced_event_info['displaced_event_title']}' "
            f"(priority {displaced_event_info['displaced_priority']}) was displaced from this court slot."
        )
    return api_response.created(result, msg)


@event_bp.route("/<int:event_id>", methods=["PUT"])
@authenticate
@authorize("coach", "admin")
def update_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return api_response.not_found("Event not found.")

    if g.user["role"] == "coach":
        assignment = TeamCoach.query.filter_by(team_id=event.team_id, coach_user_id=g.user["id"]).first()
        if not assignment:
            return api_response.forbidden("You are not assigned as a coach for this team.")

    data = request.get_json(silent=True) or {}

    new_start = _parse_dt(data.get("start_time")) or event.start_time
    new_end = _parse_dt(data.get("end_time")) or event.end_time
    new_court = data.get("court", event.court)

    if new_start >= new_end:
        return api_response.bad_request("Start time must be before end time.")

    if data.get("start_time") or data.get("end_time"):
        blocked = _find_blocked_date_for_range(new_start, new_end)
        if blocked:
            return api_response.conflict(
                f"Reservations are disabled on blocked dates. Conflicts with '{blocked.label}' ({blocked.block_type}) "
                f"from {blocked.start_date} to {blocked.end_date}."
            )

    displaced_event_info = None
    if data.get("start_time") or data.get("end_time") or data.get("court"):
        conflict = OverlapService.check_conflicts(
            court=new_court,
            team_id=event.team_id,
            coach_user_id=event.created_by_user_id,
            start_time=new_start,
            end_time=new_end,
            exclude_event_id=event.id,
        )
        if conflict:
            if conflict["type"] == "court":
                incoming_team = TeamModel.query.get(event.team_id)
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
                        reason_title = "Court booking displaced by higher-priority team"
                        reason_message = (
                            f"Your event '{conflicting_event.title}' on {conflicting_event.start_time.strftime('%b %d at %H:%M')} "
                            f"at {conflicting_event.court} was displaced by '{event.title}' "
                            f"(priority {incoming_priority} > {conflicting_priority}). Please reschedule."
                        )
                        OverlapService.displace_event(conflicting_event, reason_title, reason_message)
                else:
                    return api_response.conflict(conflict["message"], conflict)
            else:
                return api_response.conflict(conflict["message"], conflict)

    # Detect schedule change for notifications
    schedule_changed = (
        (data.get("start_time") and _parse_dt(data["start_time"]) != event.start_time)
        or (data.get("end_time") and _parse_dt(data["end_time"]) != event.end_time)
        or (data.get("court") and data["court"] != event.court)
    )

    allowed_fields = ["event_type", "title", "description", "court", "start_time", "end_time"]
    for key in allowed_fields:
        if key in data:
            val = data[key]
            if key in ("start_time", "end_time"):
                val = _parse_dt(val)
            elif isinstance(val, str):
                val = val.strip()
            setattr(event, key, val)

    # Notify players of schedule changes
    if schedule_changed:
        team_players = TeamPlayer.query.filter_by(team_id=event.team_id).all()
        player_ids = [tp.player_user_id for tp in team_players]
        if player_ids:
            NotificationService.notify_many(
                player_ids,
                "schedule_change",
                f"Event '{event.title}' has been updated.",
            )

    db.session.commit()

    result = event.to_dict()
    if displaced_event_info:
        result["displaced"] = displaced_event_info
    msg = "Event updated successfully."
    if displaced_event_info:
        msg = (
            f"Event updated. '{displaced_event_info['displaced_event_title']}' "
            f"(priority {displaced_event_info['displaced_priority']}) was displaced from this court slot."
        )
    return api_response.success(result, msg)


@event_bp.route("/<int:event_id>", methods=["DELETE"])
@authenticate
@authorize("admin", "coach")
def delete_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return api_response.not_found("Event not found.")
    if g.user["role"] == "coach":
        assignment = TeamCoach.query.filter_by(team_id=event.team_id, coach_user_id=g.user["id"]).first()
        if not assignment:
            return api_response.forbidden("You are not assigned as a coach for this team.")
    db.session.delete(event)
    db.session.commit()
    return api_response.success(None, "Event deleted.")


@event_bp.route("/", methods=["GET"])
@authenticate
def list_events():
    team_id = request.args.get("team_id", type=int)
    page = request.args.get("page", type=int)
    per_page = request.args.get("per_page", 50, type=int)
    upcoming_only = request.args.get("upcoming", "false").lower() == "true"
    limit = request.args.get("limit", type=int)

    visible_team_ids = _visible_team_ids()
    if visible_team_ids is not None and team_id and team_id not in visible_team_ids:
        return api_response.forbidden("You do not have access to that team's events.")

    query = Event.query
    if visible_team_ids is not None:
        if not visible_team_ids:
            return api_response.success([])
        query = query.filter(Event.team_id.in_(visible_team_ids))
    if team_id:
        query = query.filter_by(team_id=team_id)
    if upcoming_only:
        query = query.filter(Event.start_time >= datetime.utcnow())
    query = query.order_by(Event.start_time.asc())

    if page:
        events, meta = paginate(query, page, per_page)
        return api_response.success({
            "events": [e.to_dict(include_relations=True) for e in events],
            "pagination": meta,
        })

    if limit:
        events = query.limit(limit).all()
    else:
        events = query.all()
    return api_response.success([e.to_dict(include_relations=True) for e in events])


@event_bp.route("/<int:event_id>", methods=["GET"])
@authenticate
def get_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return api_response.not_found("Event not found.")
    visible_team_ids = _visible_team_ids()
    if visible_team_ids is not None and event.team_id not in visible_team_ids:
        return api_response.forbidden("You do not have access to this event.")
    return api_response.success(event.to_dict(include_relations=True))


@event_bp.route("/my/calendar", methods=["GET"])
@authenticate
def my_calendar():
    """Get events for the currently authenticated player's teams."""
    user_id = g.user["id"]

    if g.user["role"] == "player":
        memberships = TeamPlayer.query.filter_by(player_user_id=user_id).all()
        team_ids = [m.team_id for m in memberships]
    elif g.user["role"] == "coach":
        memberships = TeamCoach.query.filter_by(coach_user_id=user_id).all()
        team_ids = [m.team_id for m in memberships]
    elif g.user["role"] == "parent":
        # Get children, then their teams
        from models import ParentChildLink
        links = ParentChildLink.query.filter_by(parent_user_id=user_id).all()
        child_ids = [l.child_user_id for l in links]
        memberships = TeamPlayer.query.filter(TeamPlayer.player_user_id.in_(child_ids)).all()
        team_ids = [m.team_id for m in memberships]
    else:
        # Admin sees all
        team_ids = [t.id for t in Team.query.all()]

    if not team_ids:
        return api_response.success([])

    events = Event.query.filter(Event.team_id.in_(team_ids)).order_by(Event.start_time.asc()).all()
    return api_response.success([e.to_dict(include_relations=True) for e in events])


@event_bp.route("/courts", methods=["GET"])
@authenticate
def list_courts():
    """Return all distinct court names, optionally filtered by available time window."""
    start_str = request.args.get("start")
    end_str = request.args.get("end")

    all_courts = [row[0] for row in db.session.query(Event.court).distinct().order_by(Event.court).all()]

    if start_str and end_str:
        try:
            start = _parse_dt(start_str)
            end = _parse_dt(end_str)
        except Exception:
            return api_response.bad_request("Invalid start or end time format. Use ISO 8601.")
        booked = {
            row[0] for row in
            db.session.query(Event.court).filter(
                Event.start_time < end, Event.end_time > start
            ).distinct().all()
        }
        available = [c for c in all_courts if c not in booked]
        return api_response.success({"all": all_courts, "available": available, "booked": list(booked)})

    return api_response.success({"all": all_courts})


@event_bp.route("/recurring", methods=["POST"])
@authenticate
@authorize("coach", "admin")
def create_recurring_events():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("team_id"):
        errors.append({"field": "team_id", "message": "team_id is required."})
    if data.get("event_type") not in VALID_EVENT_TYPES:
        errors.append({"field": "event_type", "message": f"event_type must be one of {', '.join(VALID_EVENT_TYPES)}."})
    if not data.get("title", "").strip():
        errors.append({"field": "title", "message": "title is required."})
    if not data.get("court", "").strip():
        errors.append({"field": "court", "message": "court is required."})
    if not data.get("start_date"):
        errors.append({"field": "start_date", "message": "start_date is required (YYYY-MM-DD)."})
    if not data.get("end_date"):
        errors.append({"field": "end_date", "message": "end_date is required (YYYY-MM-DD)."})
    if not isinstance(data.get("days_of_week"), list) or not data["days_of_week"]:
        errors.append({"field": "days_of_week", "message": "days_of_week must be a non-empty list of integers 0–6."})
    if data.get("start_hour") is None:
        errors.append({"field": "start_hour", "message": "start_hour is required."})
    if not data.get("duration_minutes"):
        errors.append({"field": "duration_minutes", "message": "duration_minutes is required."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    try:
        rule_start = date.fromisoformat(data["start_date"])
        rule_end = date.fromisoformat(data["end_date"])
    except ValueError:
        return api_response.bad_request("start_date and end_date must be valid YYYY-MM-DD dates.")

    if rule_end <= rule_start:
        return api_response.bad_request("end_date must be after start_date.")
    if (rule_end - rule_start).days > 366:
        return api_response.bad_request("Recurring series cannot span more than one year.")

    user_id = g.user["id"]
    if g.user["role"] == "coach":
        if not TeamCoach.query.filter_by(team_id=data["team_id"], coach_user_id=user_id).first():
            return api_response.forbidden("You are not assigned as a coach for this team.")

    days_of_week = sorted(set(int(d) for d in data["days_of_week"] if 0 <= int(d) <= 6))
    start_hour = int(data["start_hour"])
    start_minute = int(data.get("start_minute", 0))
    duration = int(data["duration_minutes"])

    rule = RecurringEventRule(
        team_id=data["team_id"],
        created_by_user_id=user_id,
        event_type=data["event_type"],
        title=data["title"].strip(),
        description=data.get("description"),
        court=data["court"].strip(),
        days_of_week=",".join(str(d) for d in days_of_week),
        start_date=data["start_date"],
        end_date=data["end_date"],
        start_hour=start_hour,
        start_minute=start_minute,
        duration_minutes=duration,
    )
    db.session.add(rule)
    db.session.flush()

    # Build a set of all dates that fall within any blocked range
    blocked_ranges = BlockedDate.query.all()
    blocked_days = set()
    for bd in blocked_ranges:
        try:
            bd_start = date.fromisoformat(bd.start_date)
            bd_end = date.fromisoformat(bd.end_date)
            d = bd_start
            while d <= bd_end:
                blocked_days.add(d)
                d += timedelta(days=1)
        except ValueError:
            pass

    created_events = []
    skipped_conflicts = []
    current = rule_start
    while current <= rule_end:
        if current in blocked_days:
            skipped_conflicts.append({"date": current.isoformat(), "reason": {"type": "blocked", "message": "Date is a holiday or exam period."}})
            current += timedelta(days=1)
            continue
        if current.weekday() in days_of_week:
            start_dt = datetime(current.year, current.month, current.day, start_hour, start_minute)
            end_dt = start_dt + timedelta(minutes=duration)
            conflict = OverlapService.check_conflicts(
                court=rule.court,
                team_id=rule.team_id,
                coach_user_id=user_id,
                start_time=start_dt,
                end_time=end_dt,
            )
            if conflict:
                # Apply priority displacement for court conflicts in recurring series too
                if conflict["type"] == "court":
                    incoming_team = TeamModel.query.get(rule.team_id)
                    incoming_priority = incoming_team.priority_level if incoming_team else 1
                    conflicting_priority = conflict.get("conflicting_team_priority", 1)
                    if incoming_priority > conflicting_priority:
                        conflicting_event = Event.query.get(conflict["conflicting_event_id"])
                        if conflicting_event:
                            reason_title = "Court booking displaced by higher-priority recurring series"
                            reason_message = (
                                f"Your event '{conflicting_event.title}' on {start_dt.strftime('%b %d at %H:%M')} "
                                f"at {rule.court} was displaced by recurring series '{rule.title}' "
                                f"(priority {incoming_priority} > {conflicting_priority}). Please reschedule."
                            )
                            OverlapService.displace_event(conflicting_event, reason_title, reason_message)
                        # Fall through to create the recurring event
                    else:
                        skipped_conflicts.append({"date": current.isoformat(), "reason": conflict})
                        current += timedelta(days=1)
                        continue
                else:
                    skipped_conflicts.append({"date": current.isoformat(), "reason": conflict})
                    current += timedelta(days=1)
                    continue

            ev = Event(
                team_id=rule.team_id,
                created_by_user_id=user_id,
                recurring_rule_id=rule.id,
                event_type=rule.event_type,
                title=rule.title,
                description=rule.description,
                court=rule.court,
                start_time=start_dt,
                end_time=end_dt,
            )
            db.session.add(ev)
            created_events.append(ev)
        current += timedelta(days=1)

    db.session.commit()

    return api_response.created({
        "rule": rule.to_dict(),
        "events_created": len(created_events),
        "conflicts_skipped": skipped_conflicts,
    }, f"Recurring series created: {len(created_events)} event(s) scheduled.")


@event_bp.route("/recurring/<int:rule_id>", methods=["DELETE"])
@authenticate
@authorize("coach", "admin")
def delete_recurring_series(rule_id):
    rule = RecurringEventRule.query.get(rule_id)
    if not rule:
        return api_response.not_found("Recurring rule not found.")
    if g.user["role"] == "coach":
        if not TeamCoach.query.filter_by(team_id=rule.team_id, coach_user_id=g.user["id"]).first():
            return api_response.forbidden("You are not assigned as a coach for this team.")
    db.session.delete(rule)
    db.session.commit()
    return api_response.success(None, "Recurring series and all its events deleted.")


@event_bp.route("/child/<int:child_id>/schedule", methods=["GET"])
@authenticate
@authorize("parent", "admin")
def child_schedule(child_id):
    """Get events for a specific child (player)."""
    if g.user["role"] == "parent":
        link = ParentChildLink.query.filter_by(
            parent_user_id=g.user["id"], child_user_id=child_id
        ).first()
        if not link:
            return api_response.forbidden("You are not linked to this child.")

    memberships = TeamPlayer.query.filter_by(player_user_id=child_id).all()
    team_ids = [m.team_id for m in memberships]
    if not team_ids:
        return api_response.success([])

    events = Event.query.filter(Event.team_id.in_(team_ids)).order_by(Event.start_time.asc()).all()
    return api_response.success([e.to_dict(include_relations=True) for e in events])
