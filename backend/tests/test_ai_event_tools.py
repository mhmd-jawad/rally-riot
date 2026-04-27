"""AI scheduling tool smoke tests."""
import json
import sys
from datetime import datetime
from types import SimpleNamespace

from models import Event, TeamCoach, User
from routes.ai_routes import _execute_tool
from services import OverlapService


def _demo_coach_user():
    coach = User.query.filter_by(email="ali@rallyriot.com").first()
    assert coach is not None
    assignment = TeamCoach.query.filter_by(coach_user_id=coach.id).first()
    assert assignment is not None
    return coach, assignment.team_id


def _login(client, email):
    resp = client.post("/api/auth/login", json={"email": email, "password": "Password1!"})
    assert resp.status_code == 200
    token = resp.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


def test_ai_book_event_persists_event(app, db):
    with app.app_context():
        coach, team_id = _demo_coach_user()
        before_count = Event.query.count()

        result = _execute_tool(
            "book_event",
            {
                "team_id": team_id,
                "event_type": "practice",
                "title": "AI Practice Booking",
                "court": "AI Court",
                "start_time": "2027-01-10T09:00:00",
                "end_time": "2027-01-10T10:00:00",
            },
            {"id": coach.id, "role": "coach", "email": coach.email, "full_name": coach.full_name},
        )

        assert result["success"] is True
        assert Event.query.count() == before_count + 1
        assert Event.query.filter_by(title="AI Practice Booking").first() is not None


def test_ai_reschedule_event_persists_changes(app, db):
    with app.app_context():
        coach, team_id = _demo_coach_user()
        created = _execute_tool(
            "book_event",
            {
                "team_id": team_id,
                "event_type": "practice",
                "title": "AI Reschedule Booking",
                "court": "AI Court",
                "start_time": "2027-01-11T09:00:00",
                "end_time": "2027-01-11T10:00:00",
            },
            {"id": coach.id, "role": "coach", "email": coach.email, "full_name": coach.full_name},
        )
        event_id = created["event"]["id"]

        result = _execute_tool(
            "reschedule_event",
            {
                "event_id": event_id,
                "court": "AI Court 2",
                "start_time": "2027-01-12T11:00:00",
                "end_time": "2027-01-12T12:00:00",
            },
            {"id": coach.id, "role": "coach", "email": coach.email, "full_name": coach.full_name},
        )

        assert result["success"] is True
        event = Event.query.get(event_id)
        assert event.court == "AI Court 2"
        assert event.start_time == datetime.fromisoformat("2027-01-12T11:00:00")
        assert event.end_time == datetime.fromisoformat("2027-01-12T12:00:00")


def test_ai_reschedule_start_only_preserves_duration(app, db):
    with app.app_context():
        coach, team_id = _demo_coach_user()
        created = _execute_tool(
            "book_event",
            {
                "team_id": team_id,
                "event_type": "practice",
                "title": "AI Start Only Reschedule",
                "court": "AI Court",
                "start_time": "2027-01-13T09:00:00Z",
                "end_time": "2027-01-13T10:30:00Z",
            },
            {"id": coach.id, "role": "coach", "email": coach.email, "full_name": coach.full_name},
        )
        event_id = created["event"]["id"]

        result = _execute_tool(
            "reschedule_event",
            {
                "event_id": event_id,
                "start_time": "2027-01-14T15:00:00Z",
            },
            {"id": coach.id, "role": "coach", "email": coach.email, "full_name": coach.full_name},
        )

        assert result["success"] is True
        event = Event.query.get(event_id)
        assert event.start_time == datetime.fromisoformat("2027-01-14T15:00:00")
        assert event.end_time == datetime.fromisoformat("2027-01-14T16:30:00")


def test_ai_booking_conflict_returns_valid_alternative_slot(app, db):
    with app.app_context():
        coach, team_id = _demo_coach_user()
        user = {"id": coach.id, "role": "coach", "email": coach.email, "full_name": coach.full_name}
        created = _execute_tool(
            "book_event",
            {
                "team_id": team_id,
                "event_type": "practice",
                "title": "Existing AI Conflict",
                "court": "AI Conflict Court",
                "start_time": "2027-01-15T09:00:00",
                "end_time": "2027-01-15T10:00:00",
            },
            user,
        )
        assert created["success"] is True

        result = _execute_tool(
            "book_event",
            {
                "team_id": team_id,
                "event_type": "practice",
                "title": "Conflicting AI Request",
                "court": "AI Conflict Court",
                "start_time": "2027-01-15T09:30:00",
                "end_time": "2027-01-15T10:30:00",
            },
            user,
        )

        assert "conflict" in result
        assert result["alternative_slots"]
        first_slot = result["alternative_slots"][0]
        start = datetime.fromisoformat(first_slot["start_time"])
        end = datetime.fromisoformat(first_slot["end_time"])
        assert OverlapService.check_conflicts(
            court="AI Conflict Court",
            team_id=team_id,
            coach_user_id=coach.id,
            start_time=start,
            end_time=end,
        ) is None


def test_ai_rejects_unauthorized_booking_and_rescheduling(app, db):
    with app.app_context():
        coach, team_id = _demo_coach_user()
        player = User.query.filter_by(email="omar@rallyriot.com").first()
        parent = User.query.filter_by(email="ahmad@rallyriot.com").first()
        event = _execute_tool(
            "book_event",
            {
                "team_id": team_id,
                "event_type": "practice",
                "title": "Permission Test Booking",
                "court": "AI Permission Court",
                "start_time": "2027-01-16T09:00:00",
                "end_time": "2027-01-16T10:00:00",
            },
            {"id": coach.id, "role": "coach", "email": coach.email, "full_name": coach.full_name},
        )

        for user in (player, parent):
            actor = {"id": user.id, "role": user.role, "email": user.email, "full_name": user.full_name}
            book_result = _execute_tool(
                "book_event",
                {
                    "team_id": team_id,
                    "event_type": "practice",
                    "title": "Unauthorized Booking",
                    "court": "AI Permission Court",
                    "start_time": "2027-01-17T09:00:00",
                    "end_time": "2027-01-17T10:00:00",
                },
                actor,
            )
            reschedule_result = _execute_tool(
                "reschedule_event",
                {"event_id": event["event"]["id"], "start_time": "2027-01-18T09:00:00"},
                actor,
            )

            assert "Only coaches and admins" in book_result["error"]
            assert "Only coaches and admins" in reschedule_result["error"]


def test_ai_chat_rejects_player_booking_request_without_openai(client):
    resp = client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "Book Court A tomorrow for practice"}]},
        headers=_login(client, "omar@rallyriot.com"),
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert "Only admins and coaches can modify the schedule" in data["reply"]


def test_admin_ai_booking_requires_confirmation_before_execution(client, app, db, monkeypatch):
    with app.app_context():
        _, team_id = _demo_coach_user()
        before_count = Event.query.count()

    class FakeOpenAI:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(create=self.create_completion)
            )

        def create_completion(self, **kwargs):
            tool_call = SimpleNamespace(
                id="call_1",
                function=SimpleNamespace(
                    name="book_event",
                    arguments=json.dumps({
                        "team_id": team_id,
                        "event_type": "practice",
                        "title": "Admin Needs Confirmation",
                        "court": "AI Admin Court",
                        "start_time": "2027-01-19T09:00:00",
                        "end_time": "2027-01-19T10:00:00",
                    }),
                ),
            )
            return SimpleNamespace(
                choices=[SimpleNamespace(finish_reason="tool_calls", message=SimpleNamespace(tool_calls=[tool_call]))]
            )

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=FakeOpenAI))
    monkeypatch.setitem(app.config, "OPENAI_API_KEY", "test-key")

    resp = client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "Book a practice for Thunder"}]},
        headers=_login(client, "admin@rallyriot.com"),
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["pending_confirmation"]["tool"] == "book_event"
    assert data["write_actions"] == []
    with app.app_context():
        assert Event.query.count() == before_count


def test_admin_pending_confirmation_executes_booking(client, app, db):
    with app.app_context():
        _, team_id = _demo_coach_user()
        before_count = Event.query.count()

    pending = {
        "tool": "book_event",
        "inputs": {
            "team_id": team_id,
            "event_type": "practice",
            "title": "Confirmed Admin Booking",
            "court": "AI Admin Court",
            "start_time": "2027-01-20T09:00:00",
            "end_time": "2027-01-20T10:00:00",
        },
        "summary": "Confirm booking.",
    }
    resp = client.post(
        "/api/ai/chat",
        json={
            "messages": [{"role": "user", "content": "confirm"}],
            "pending_confirmation": pending,
        },
        headers=_login(client, "admin@rallyriot.com"),
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["write_actions"][0]["type"] == "event_created"
    with app.app_context():
        assert Event.query.count() == before_count + 1
        assert Event.query.filter_by(title="Confirmed Admin Booking").first() is not None


def test_admin_pending_confirmation_can_cancel_deletion(client, app, db):
    with app.app_context():
        coach, team_id = _demo_coach_user()
        created = _execute_tool(
            "book_event",
            {
                "team_id": team_id,
                "event_type": "practice",
                "title": "Do Not Delete",
                "court": "AI Admin Court",
                "start_time": "2027-01-21T09:00:00",
                "end_time": "2027-01-21T10:00:00",
            },
            {"id": coach.id, "role": "coach", "email": coach.email, "full_name": coach.full_name},
        )
        event_id = created["event"]["id"]

    resp = client.post(
        "/api/ai/chat",
        json={
            "messages": [{"role": "user", "content": "cancel"}],
            "pending_confirmation": {
                "tool": "delete_event",
                "inputs": {"event_id": event_id},
                "summary": "Confirm cancellation.",
            },
        },
        headers=_login(client, "admin@rallyriot.com"),
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["write_actions"] == []
    with app.app_context():
        assert Event.query.get(event_id) is not None
