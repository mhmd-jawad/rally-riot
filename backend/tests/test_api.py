"""Comprehensive test suite for RallyRiot Python backend."""
import json
import io
import pytest


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def admin_login(client):
    """Login using the seeded admin account."""
    return login(client, "admin@rallyriot.com", "Password1!")


def register(client, email, password, full_name, role):
    """Create a user via the admin-only endpoint."""
    admin_token, _ = admin_login(client)
    return client.post("/api/users/", json={
        "email": email,
        "password": password,
        "full_name": full_name,
        "role": role,
    }, headers=auth_header(admin_token))


def login(client, email, password="password123"):
    """Login and return (token, user_dict)."""
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    data = resp.get_json()
    return data["data"]["token"], data["data"]["user"]


def make_user(client, email, full_name, role, password="password123"):
    """Register + login convenience. Returns (token, user)."""
    register(client, email, password, full_name, role)
    return login(client, email, password)


# ═══════════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════

class TestHealth:
    def test_health_endpoint(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "ok"


# ═══════════════════════════════════════════════════════════════
# AUTH ROUTES
# ═══════════════════════════════════════════════════════════════

class TestAuth:
    def test_login_missing_fields(self, client, db):
        resp = client.post("/api/auth/login", json={})
        assert resp.status_code == 400

    def test_login_invalid_credentials(self, client, db):
        resp = client.post("/api/auth/login", json={
            "email": "nobody@test.com", "password": "wrong",
        })
        assert resp.status_code == 401

    def test_register_and_login_success(self, client, db):
        register(client, "auth@test.com", "password123", "Auth User", "admin")
        resp = client.post("/api/auth/login", json={
            "email": "auth@test.com", "password": "password123",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert "token" in data["data"]
        assert data["data"]["user"]["email"] == "auth@test.com"

    def test_public_register_is_blocked(self, client, db):
        resp = client.post("/api/auth/register", json={
            "email": "blocked@test.com",
            "password": "password123",
            "full_name": "Blocked User",
            "role": "player",
        })
        assert resp.status_code == 403

    def test_me_unauthenticated(self, client, db):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_me_authenticated(self, client, db):
        token, _ = make_user(client, "me@test.com", "Me User", "admin")
        resp = client.get("/api/auth/me", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.get_json()["data"]["email"] == "me@test.com"

    def test_logout(self, client, db):
        resp = client.post("/api/auth/logout")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════
# USER ROUTES (admin-only CRUD)
# ═══════════════════════════════════════════════════════════════

class TestUsers:
    def test_create_user_as_admin(self, client, db):
        token, _ = make_user(client, "adm@test.com", "Admin", "admin")
        resp = client.post("/api/users/", json={
            "email": "new@test.com", "password": "password123",
            "full_name": "New User", "role": "player",
        }, headers=auth_header(token))
        assert resp.status_code == 201
        assert resp.get_json()["data"]["email"] == "new@test.com"

    def test_create_user_missing_fields(self, client, db):
        token, _ = make_user(client, "adm2@test.com", "Admin2", "admin")
        resp = client.post("/api/users/", json={}, headers=auth_header(token))
        assert resp.status_code == 400

    def test_create_user_invalid_role(self, client, db):
        token, _ = make_user(client, "adm3@test.com", "Admin3", "admin")
        resp = client.post("/api/users/", json={
            "email": "bad@test.com", "password": "password123",
            "full_name": "Bad", "role": "superadmin",
        }, headers=auth_header(token))
        assert resp.status_code == 400

    def test_create_user_short_password(self, client, db):
        token, _ = make_user(client, "adm4@test.com", "Admin4", "admin")
        resp = client.post("/api/users/", json={
            "email": "sp@test.com", "password": "12",
            "full_name": "Short", "role": "player",
        }, headers=auth_header(token))
        assert resp.status_code == 400

    def test_create_duplicate_email(self, client, db):
        token, _ = make_user(client, "adm5@test.com", "Admin5", "admin")
        client.post("/api/users/", json={
            "email": "dup@test.com", "password": "password123",
            "full_name": "Dup", "role": "player",
        }, headers=auth_header(token))
        resp = client.post("/api/users/", json={
            "email": "dup@test.com", "password": "password123",
            "full_name": "Dup2", "role": "player",
        }, headers=auth_header(token))
        assert resp.status_code == 409

    def test_list_users_unauthenticated(self, client, db):
        resp = client.get("/api/users/")
        assert resp.status_code == 401

    def test_list_users_as_admin(self, client, db):
        token, _ = make_user(client, "adm6@test.com", "Admin6", "admin")
        resp = client.get("/api/users/", headers=auth_header(token))
        assert resp.status_code == 200
        assert isinstance(resp.get_json()["data"], list)

    def test_list_users_forbidden_for_player(self, client, db):
        token, _ = make_user(client, "pl@test.com", "Player", "player")
        resp = client.get("/api/users/", headers=auth_header(token))
        assert resp.status_code == 403

    def test_get_user_by_id(self, client, db):
        token, user = make_user(client, "getme@test.com", "Get Me", "admin")
        resp = client.get(f"/api/users/{user['id']}", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.get_json()["data"]["email"] == "getme@test.com"

    def test_get_user_not_found(self, client, db):
        token, _ = make_user(client, "a@test.com", "A", "admin")
        resp = client.get("/api/users/9999", headers=auth_header(token))
        assert resp.status_code == 404

    def test_assign_role(self, client, db):
        admin_token, _ = make_user(client, "adr@test.com", "Admin R", "admin")
        _, target = make_user(client, "target@test.com", "Target", "player")
        resp = client.patch(f"/api/users/{target['id']}/role", json={"role": "coach"},
                            headers=auth_header(admin_token))
        assert resp.status_code == 200
        assert resp.get_json()["data"]["role"] == "coach"


# ═══════════════════════════════════════════════════════════════
# TEAM ROUTES
# ═══════════════════════════════════════════════════════════════

class TestTeams:
    def test_create_team_unauthenticated(self, client, db):
        resp = client.post("/api/teams/", json={"name": "X"})
        assert resp.status_code == 401

    def test_create_team_missing_name(self, client, db):
        token, _ = make_user(client, "ta@test.com", "Team Admin", "admin")
        resp = client.post("/api/teams/", json={}, headers=auth_header(token))
        assert resp.status_code == 400

    def test_create_team_success(self, client, db):
        token, _ = make_user(client, "ta2@test.com", "Team Admin2", "admin")
        resp = client.post("/api/teams/", json={
            "name": "Test Team", "age_group": "U12", "skill_level": "beginner",
        }, headers=auth_header(token))
        assert resp.status_code == 201
        assert resp.get_json()["data"]["name"] == "Test Team"

    def test_create_duplicate_team(self, client, db):
        token, _ = make_user(client, "ta3@test.com", "Team Admin3", "admin")
        client.post("/api/teams/", json={"name": "Dup Team"}, headers=auth_header(token))
        resp = client.post("/api/teams/", json={"name": "Dup Team"}, headers=auth_header(token))
        assert resp.status_code == 409

    def test_list_teams(self, client, db):
        token, _ = make_user(client, "ta4@test.com", "Team Admin4", "admin")
        client.post("/api/teams/", json={"name": "LT1"}, headers=auth_header(token))
        resp = client.get("/api/teams/", headers=auth_header(token))
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) >= 1

    def test_get_team_by_id(self, client, db):
        token, _ = make_user(client, "ta5@test.com", "Team Admin5", "admin")
        r = client.post("/api/teams/", json={"name": "Find Me"}, headers=auth_header(token))
        tid = r.get_json()["data"]["id"]
        resp = client.get(f"/api/teams/{tid}", headers=auth_header(token))
        assert resp.status_code == 200

    def test_get_team_not_found(self, client, db):
        token, _ = make_user(client, "ta6@test.com", "Team Admin6", "admin")
        resp = client.get("/api/teams/9999", headers=auth_header(token))
        assert resp.status_code == 404

    def test_assign_coach_to_team(self, client, db):
        admin_token, _ = make_user(client, "ta7@test.com", "Team Admin7", "admin")
        _, coach = make_user(client, "tc@test.com", "Team Coach", "coach")
        r = client.post("/api/teams/", json={"name": "Coach Team"}, headers=auth_header(admin_token))
        tid = r.get_json()["data"]["id"]
        resp = client.post(f"/api/teams/{tid}/coaches", json={
            "coach_user_id": coach["id"],
        }, headers=auth_header(admin_token))
        assert resp.status_code == 201

    def test_assign_coach_duplicate(self, client, db):
        admin_token, _ = make_user(client, "ta8@test.com", "Team Admin8", "admin")
        _, coach = make_user(client, "tcd@test.com", "Coach Dup", "coach")
        r = client.post("/api/teams/", json={"name": "Dup Coach Team"}, headers=auth_header(admin_token))
        tid = r.get_json()["data"]["id"]
        client.post(f"/api/teams/{tid}/coaches", json={"coach_user_id": coach["id"]}, headers=auth_header(admin_token))
        resp = client.post(f"/api/teams/{tid}/coaches", json={"coach_user_id": coach["id"]}, headers=auth_header(admin_token))
        assert resp.status_code == 409

    def test_assign_player_to_team(self, client, db):
        admin_token, _ = make_user(client, "ta9@test.com", "Team Admin9", "admin")
        _, player = make_user(client, "tp@test.com", "Team Player", "player")
        r = client.post("/api/teams/", json={"name": "Player Team"}, headers=auth_header(admin_token))
        tid = r.get_json()["data"]["id"]
        resp = client.post(f"/api/teams/{tid}/players", json={
            "player_user_id": player["id"],
        }, headers=auth_header(admin_token))
        assert resp.status_code == 201

    def test_assign_player_duplicate(self, client, db):
        admin_token, _ = make_user(client, "ta10@test.com", "Team Admin10", "admin")
        _, player = make_user(client, "tpd@test.com", "Player Dup", "player")
        r = client.post("/api/teams/", json={"name": "Dup Player Team"}, headers=auth_header(admin_token))
        tid = r.get_json()["data"]["id"]
        client.post(f"/api/teams/{tid}/players", json={"player_user_id": player["id"]}, headers=auth_header(admin_token))
        resp = client.post(f"/api/teams/{tid}/players", json={"player_user_id": player["id"]}, headers=auth_header(admin_token))
        assert resp.status_code == 409


# ═══════════════════════════════════════════════════════════════
# PARENT-CHILD ROUTES
# ═══════════════════════════════════════════════════════════════

class TestParentChild:
    def _setup(self, client):
        parent_token, parent = make_user(client, "par@test.com", "Parent", "parent")
        _, child = make_user(client, "child@test.com", "Child", "player")
        return parent_token, parent, child

    def test_link_child(self, client, db):
        parent_token, _, child = self._setup(client)
        resp = client.post("/api/parent-child/", json={
            "child_user_id": child["id"],
        }, headers=auth_header(parent_token))
        assert resp.status_code == 201

    def test_link_child_duplicate(self, client, db):
        parent_token, _, child = self._setup(client)
        client.post("/api/parent-child/", json={"child_user_id": child["id"]},
                     headers=auth_header(parent_token))
        resp = client.post("/api/parent-child/", json={"child_user_id": child["id"]},
                           headers=auth_header(parent_token))
        assert resp.status_code == 409

    def test_get_children(self, client, db):
        parent_token, _, child = self._setup(client)
        client.post("/api/parent-child/", json={"child_user_id": child["id"]},
                     headers=auth_header(parent_token))
        resp = client.get("/api/parent-child/", headers=auth_header(parent_token))
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) == 1

    def test_link_non_player_fails(self, client, db):
        parent_token, _, _ = self._setup(client)
        _, coach = make_user(client, "notplayer@test.com", "Not Player", "coach")
        resp = client.post("/api/parent-child/", json={
            "child_user_id": coach["id"],
        }, headers=auth_header(parent_token))
        assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════════
# EVENT ROUTES
# ═══════════════════════════════════════════════════════════════

class TestEvents:
    def _setup(self, client):
        admin_token, _ = make_user(client, "evadmin@test.com", "Ev Admin", "admin")
        coach_token, coach = make_user(client, "evcoach@test.com", "Ev Coach", "coach")
        tr = client.post("/api/teams/", json={"name": "Ev Team"}, headers=auth_header(admin_token))
        team_id = tr.get_json()["data"]["id"]
        client.post(f"/api/teams/{team_id}/coaches", json={"coach_user_id": coach["id"]},
                     headers=auth_header(admin_token))
        return admin_token, coach_token, coach, team_id

    def test_create_event_unauthenticated(self, client, db):
        resp = client.post("/api/events/", json={"title": "X"})
        assert resp.status_code == 401

    def test_create_event_missing_fields(self, client, db):
        admin_token, _, _, _ = self._setup(client)
        resp = client.post("/api/events/", json={}, headers=auth_header(admin_token))
        assert resp.status_code == 400

    def test_create_event_success(self, client, db):
        _, coach_token, _, team_id = self._setup(client)
        resp = client.post("/api/events/", json={
            "team_id": team_id, "title": "Test Practice",
            "event_type": "practice", "court": "Court A",
            "start_time": "2025-06-01T10:00:00Z",
            "end_time": "2025-06-01T12:00:00Z",
        }, headers=auth_header(coach_token))
        assert resp.status_code == 201
        assert resp.get_json()["data"]["title"] == "Test Practice"

    def test_list_events(self, client, db):
        admin_token, coach_token, _, team_id = self._setup(client)
        client.post("/api/events/", json={
            "team_id": team_id, "title": "E1", "event_type": "practice",
            "court": "A", "start_time": "2025-06-01T10:00:00Z",
            "end_time": "2025-06-01T12:00:00Z",
        }, headers=auth_header(coach_token))
        resp = client.get("/api/events/", headers=auth_header(admin_token))
        assert resp.status_code == 200

    def test_get_event_by_id(self, client, db):
        admin_token, coach_token, _, team_id = self._setup(client)
        r = client.post("/api/events/", json={
            "team_id": team_id, "title": "E2", "event_type": "match",
            "court": "B", "start_time": "2025-06-02T10:00:00Z",
            "end_time": "2025-06-02T12:00:00Z",
        }, headers=auth_header(coach_token))
        eid = r.get_json()["data"]["id"]
        resp = client.get(f"/api/events/{eid}", headers=auth_header(admin_token))
        assert resp.status_code == 200

    def test_update_event(self, client, db):
        _, coach_token, _, team_id = self._setup(client)
        r = client.post("/api/events/", json={
            "team_id": team_id, "title": "Old Title", "event_type": "practice",
            "court": "A", "start_time": "2025-06-03T10:00:00Z",
            "end_time": "2025-06-03T12:00:00Z",
        }, headers=auth_header(coach_token))
        eid = r.get_json()["data"]["id"]
        resp = client.put(f"/api/events/{eid}", json={"title": "New Title"},
                          headers=auth_header(coach_token))
        assert resp.status_code == 200
        assert resp.get_json()["data"]["title"] == "New Title"

    def test_delete_event(self, client, db):
        admin_token, coach_token, _, team_id = self._setup(client)
        r = client.post("/api/events/", json={
            "team_id": team_id, "title": "Delete Me", "event_type": "practice",
            "court": "A", "start_time": "2025-06-04T10:00:00Z",
            "end_time": "2025-06-04T12:00:00Z",
        }, headers=auth_header(coach_token))
        eid = r.get_json()["data"]["id"]
        resp = client.delete(f"/api/events/{eid}", headers=auth_header(admin_token))
        assert resp.status_code == 200

    def test_coach_can_delete_assigned_team_event(self, client, db):
        _, coach_token, _, team_id = self._setup(client)
        r = client.post("/api/events/", json={
            "team_id": team_id, "title": "Coach Delete", "event_type": "practice",
            "court": "A", "start_time": "2025-06-04T14:00:00Z",
            "end_time": "2025-06-04T16:00:00Z",
        }, headers=auth_header(coach_token))
        eid = r.get_json()["data"]["id"]
        resp = client.delete(f"/api/events/{eid}", headers=auth_header(coach_token))
        assert resp.status_code == 200

    def test_event_not_found(self, client, db):
        admin_token, _, _, _ = self._setup(client)
        resp = client.get("/api/events/9999", headers=auth_header(admin_token))
        assert resp.status_code == 404

    def test_player_calendar(self, client, db):
        admin_token, coach_token, _, team_id = self._setup(client)
        player_token, player = make_user(client, "calplayer@test.com", "Cal Player", "player")
        client.post(f"/api/teams/{team_id}/players", json={"player_user_id": player["id"]},
                     headers=auth_header(admin_token))
        client.post("/api/events/", json={
            "team_id": team_id, "title": "Cal Event", "event_type": "practice",
            "court": "A", "start_time": "2025-06-05T10:00:00Z",
            "end_time": "2025-06-05T12:00:00Z",
        }, headers=auth_header(coach_token))
        resp = client.get("/api/events/my/calendar", headers=auth_header(player_token))
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) >= 1

    def test_event_visibility_is_role_scoped(self, client, db):
        admin_token, coach_token, _, team_id = self._setup(client)
        _, other_player = make_user(client, "otherplayer@test.com", "Other Player", "player")
        other_player_token, _ = login(client, "otherplayer@test.com")
        r = client.post("/api/events/", json={
            "team_id": team_id, "title": "Private Event", "event_type": "practice",
            "court": "A", "start_time": "2025-06-06T10:00:00Z",
            "end_time": "2025-06-06T12:00:00Z",
        }, headers=auth_header(coach_token))
        eid = r.get_json()["data"]["id"]

        list_resp = client.get("/api/events/", headers=auth_header(other_player_token))
        get_resp = client.get(f"/api/events/{eid}", headers=auth_header(other_player_token))

        assert list_resp.status_code == 200
        assert list_resp.get_json()["data"] == []
        assert get_resp.status_code == 403

    def test_schedule_change_notifications_persist(self, client, db):
        admin_token, coach_token, _, team_id = self._setup(client)
        player_token, player = make_user(client, "notifyplayer@test.com", "Notify Player", "player")
        client.post(f"/api/teams/{team_id}/players", json={"player_user_id": player["id"]},
                     headers=auth_header(admin_token))
        r = client.post("/api/events/", json={
            "team_id": team_id, "title": "Notify Event", "event_type": "practice",
            "court": "A", "start_time": "2025-06-07T10:00:00Z",
            "end_time": "2025-06-07T12:00:00Z",
        }, headers=auth_header(coach_token))
        eid = r.get_json()["data"]["id"]

        resp = client.put(f"/api/events/{eid}", json={"court": "Court Z"},
                          headers=auth_header(coach_token))
        assert resp.status_code == 200

        notif_resp = client.get("/api/notifications/", headers=auth_header(player_token))
        assert notif_resp.status_code == 200
        assert any(n["type"] == "schedule_change" for n in notif_resp.get_json()["data"])


# ═══════════════════════════════════════════════════════════════
# REGISTRATION ROUTES
# ═══════════════════════════════════════════════════════════════

class TestRegistrations:
    def _setup(self, client):
        admin_token, _ = make_user(client, "radmin@test.com", "Reg Admin", "admin")
        tr = client.post("/api/teams/", json={"name": "Reg Team"}, headers=auth_header(admin_token))
        team_id = tr.get_json()["data"]["id"]
        parent_token, parent = make_user(client, "rpar@test.com", "Reg Parent", "parent")
        _, player = make_user(client, "rplay@test.com", "Reg Player", "player")
        client.post("/api/parent-child/", json={"child_user_id": player["id"]},
                     headers=auth_header(parent_token))
        return admin_token, parent_token, parent, player, team_id

    def test_create_registration_form(self, client, db):
        admin_token, _, _, _, team_id = self._setup(client)
        resp = client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "Test Form",
            "description": "Test", "season": "2025-Spring", "fee": 150.00,
        }, headers=auth_header(admin_token))
        assert resp.status_code == 201

    def test_list_registration_forms(self, client, db):
        admin_token, _, _, _, team_id = self._setup(client)
        client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "LF", "season": "2025",
        }, headers=auth_header(admin_token))
        resp = client.get("/api/registrations/forms", headers=auth_header(admin_token))
        assert resp.status_code == 200

    def test_submit_registration(self, client, db):
        admin_token, parent_token, parent, player, team_id = self._setup(client)
        fr = client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "Submit Form", "season": "2025", "fee": 100,
        }, headers=auth_header(admin_token))
        form_id = fr.get_json()["data"]["id"]
        resp = client.post("/api/registrations/", json={
            "form_id": form_id, "player_user_id": player["id"],
        }, headers=auth_header(parent_token))
        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert data["registration"]["form_id"] == form_id
        assert "invoice" in data

    def test_submit_duplicate_registration(self, client, db):
        admin_token, parent_token, parent, player, team_id = self._setup(client)
        fr = client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "Dup Form", "season": "2025", "fee": 100,
        }, headers=auth_header(admin_token))
        form_id = fr.get_json()["data"]["id"]
        client.post("/api/registrations/", json={
            "form_id": form_id, "player_user_id": player["id"],
        }, headers=auth_header(parent_token))
        resp = client.post("/api/registrations/", json={
            "form_id": form_id, "player_user_id": player["id"],
        }, headers=auth_header(parent_token))
        assert resp.status_code == 409

    def test_parent_cannot_register_unlinked_child(self, client, db):
        admin_token, parent_token, _, _, team_id = self._setup(client)
        _, other_child = make_user(client, "otherchild@test.com", "Other Child", "player")
        fr = client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "Link Required", "season": "2025", "fee": 100,
        }, headers=auth_header(admin_token))
        form_id = fr.get_json()["data"]["id"]
        resp = client.post("/api/registrations/", json={
            "form_id": form_id, "player_user_id": other_child["id"],
        }, headers=auth_header(parent_token))
        assert resp.status_code == 403

    def test_parent_cannot_view_other_family_registration(self, client, db):
        admin_token, _, _, _, team_id = self._setup(client)
        parent1_token, parent1 = make_user(client, "family1@test.com", "Family One", "parent")
        parent2_token, _ = make_user(client, "family2@test.com", "Family Two", "parent")
        _, child = make_user(client, "familychild@test.com", "Family Child", "player")
        client.post("/api/parent-child/", json={"child_user_id": child["id"]},
                     headers=auth_header(parent1_token))
        fr = client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "Family Form", "season": "2025", "fee": 100,
        }, headers=auth_header(admin_token))
        form_id = fr.get_json()["data"]["id"]
        reg_resp = client.post("/api/registrations/", json={
            "form_id": form_id, "player_user_id": child["id"],
        }, headers=auth_header(parent1_token))
        reg_id = reg_resp.get_json()["data"]["registration"]["id"]

        resp = client.get(f"/api/registrations/{reg_id}", headers=auth_header(parent2_token))
        assert resp.status_code == 403

    def test_waiver_upload_uses_multipart_and_persists(self, client, db):
        admin_token, parent_token, _, player, team_id = self._setup(client)
        fr = client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "Waiver Form", "season": "2025", "fee": 100,
            "requires_waiver": True,
        }, headers=auth_header(admin_token))
        form_id = fr.get_json()["data"]["id"]
        reg_resp = client.post("/api/registrations/", json={
            "form_id": form_id, "player_user_id": player["id"],
        }, headers=auth_header(parent_token))
        reg_id = reg_resp.get_json()["data"]["registration"]["id"]

        upload_resp = client.post(
            f"/api/registrations/{reg_id}/waivers",
            data={"file": (io.BytesIO(b"%PDF-1.4 waiver"), "waiver.pdf")},
            headers=auth_header(parent_token),
            content_type="multipart/form-data",
        )
        assert upload_resp.status_code == 201

        list_resp = client.get(f"/api/registrations/{reg_id}/waivers", headers=auth_header(parent_token))
        assert list_resp.status_code == 200
        assert len(list_resp.get_json()["data"]) == 1

    def test_approval_requires_waiver_when_form_demands_it(self, client, db):
        admin_token, parent_token, _, player, team_id = self._setup(client)
        fr = client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "Approval Form", "season": "2025", "fee": 100,
            "requires_waiver": True,
        }, headers=auth_header(admin_token))
        form_id = fr.get_json()["data"]["id"]
        reg_resp = client.post("/api/registrations/", json={
            "form_id": form_id, "player_user_id": player["id"],
        }, headers=auth_header(parent_token))
        reg_id = reg_resp.get_json()["data"]["registration"]["id"]

        resp = client.patch(
            f"/api/registrations/{reg_id}/status",
            json={"status": "approved"},
            headers=auth_header(admin_token),
        )
        assert resp.status_code == 409


# ═══════════════════════════════════════════════════════════════
# INVOICE ROUTES
# ═══════════════════════════════════════════════════════════════

class TestInvoices:
    def _setup_with_invoice(self, client):
        admin_token, _ = make_user(client, "iadmin@test.com", "Inv Admin", "admin")
        tr = client.post("/api/teams/", json={"name": "Inv Team"}, headers=auth_header(admin_token))
        team_id = tr.get_json()["data"]["id"]
        parent_token, parent = make_user(client, "ipar@test.com", "Inv Parent", "parent")
        _, player = make_user(client, "iplay@test.com", "Inv Player", "player")
        client.post("/api/parent-child/", json={"child_user_id": player["id"]},
                     headers=auth_header(parent_token))
        fr = client.post("/api/registrations/forms", json={
            "team_id": team_id, "title": "Inv Form", "season": "2025", "fee": 200,
        }, headers=auth_header(admin_token))
        form_id = fr.get_json()["data"]["id"]
        reg_resp = client.post("/api/registrations/", json={
            "form_id": form_id, "player_user_id": player["id"],
        }, headers=auth_header(parent_token))
        invoice = reg_resp.get_json()["data"]["invoice"]
        return admin_token, parent_token, invoice

    def test_list_invoices_as_parent(self, client, db):
        _, parent_token, _ = self._setup_with_invoice(client)
        resp = client.get("/api/invoices/", headers=auth_header(parent_token))
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert "invoices" in data
        assert "summary" in data
        assert len(data["invoices"]) >= 1

    def test_list_invoices_as_admin(self, client, db):
        admin_token, _, _ = self._setup_with_invoice(client)
        resp = client.get("/api/invoices/", headers=auth_header(admin_token))
        assert resp.status_code == 200

    def test_get_invoice_by_id(self, client, db):
        _, parent_token, invoice = self._setup_with_invoice(client)
        resp = client.get(f"/api/invoices/{invoice['id']}", headers=auth_header(parent_token))
        assert resp.status_code == 200

    def test_mark_invoice_paid(self, client, db):
        _, parent_token, invoice = self._setup_with_invoice(client)
        resp = client.patch(f"/api/invoices/{invoice['id']}/pay", headers=auth_header(parent_token))
        assert resp.status_code == 200
        assert resp.get_json()["data"]["status"] == "paid"

    def test_player_cannot_access_invoice_endpoints(self, client, db):
        _, _, invoice = self._setup_with_invoice(client)
        player_token, _ = make_user(client, "invoiceviewer@test.com", "Invoice Viewer", "player")
        resp = client.get(f"/api/invoices/{invoice['id']}", headers=auth_header(player_token))
        assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════
# RSVP ROUTES
# ═══════════════════════════════════════════════════════════════

class TestRSVP:
    def _setup(self, client):
        admin_token, _ = make_user(client, "rsvpadmin@test.com", "RSVP Admin", "admin")
        coach_token, coach = make_user(client, "rsvpcoach@test.com", "RSVP Coach", "coach")
        player_token, player = make_user(client, "rsvpplayer@test.com", "RSVP Player", "player")
        tr = client.post("/api/teams/", json={"name": "RSVP Team"}, headers=auth_header(admin_token))
        team_id = tr.get_json()["data"]["id"]
        client.post(f"/api/teams/{team_id}/coaches", json={"coach_user_id": coach["id"]},
                     headers=auth_header(admin_token))
        client.post(f"/api/teams/{team_id}/players", json={"player_user_id": player["id"]},
                     headers=auth_header(admin_token))
        er = client.post("/api/events/", json={
            "team_id": team_id, "title": "RSVP Event", "event_type": "practice",
            "court": "A", "start_time": "2025-06-10T10:00:00Z",
            "end_time": "2025-06-10T12:00:00Z",
        }, headers=auth_header(coach_token))
        event_id = er.get_json()["data"]["id"]
        return admin_token, coach_token, player_token, player, team_id, event_id

    def test_rsvp_as_player(self, client, db):
        _, _, player_token, player, _, event_id = self._setup(client)
        resp = client.post("/api/rsvps/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "attending",
        }, headers=auth_header(player_token))
        assert resp.status_code == 201

    def test_rsvp_update(self, client, db):
        _, _, player_token, player, _, event_id = self._setup(client)
        client.post("/api/rsvps/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "attending",
        }, headers=auth_header(player_token))
        resp = client.post("/api/rsvps/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "not_attending",
        }, headers=auth_header(player_token))
        assert resp.status_code == 200
        assert resp.get_json()["data"]["status"] == "not_attending"

    def test_rsvp_invalid_status(self, client, db):
        _, _, player_token, player, _, event_id = self._setup(client)
        resp = client.post("/api/rsvps/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "invalid",
        }, headers=auth_header(player_token))
        assert resp.status_code == 400

    def test_get_rsvps_for_event(self, client, db):
        admin_token, _, player_token, player, _, event_id = self._setup(client)
        client.post("/api/rsvps/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "attending",
        }, headers=auth_header(player_token))
        resp = client.get(f"/api/rsvps/event/{event_id}", headers=auth_header(admin_token))
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) == 1

    def test_player_cannot_list_rsvps_for_event(self, client, db):
        _, _, player_token, _, _, event_id = self._setup(client)
        resp = client.get(f"/api/rsvps/event/{event_id}", headers=auth_header(player_token))
        assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════
# ATTENDANCE ROUTES
# ═══════════════════════════════════════════════════════════════

class TestAttendance:
    def _setup(self, client):
        admin_token, _ = make_user(client, "attadmin@test.com", "Att Admin", "admin")
        coach_token, coach = make_user(client, "attcoach@test.com", "Att Coach", "coach")
        player_token, player = make_user(client, "attplayer@test.com", "Att Player", "player")
        tr = client.post("/api/teams/", json={"name": "Att Team"}, headers=auth_header(admin_token))
        team_id = tr.get_json()["data"]["id"]
        client.post(f"/api/teams/{team_id}/coaches", json={"coach_user_id": coach["id"]},
                     headers=auth_header(admin_token))
        client.post(f"/api/teams/{team_id}/players", json={"player_user_id": player["id"]},
                     headers=auth_header(admin_token))
        er = client.post("/api/events/", json={
            "team_id": team_id, "title": "Att Event", "event_type": "practice",
            "court": "A", "start_time": "2025-06-12T10:00:00Z",
            "end_time": "2025-06-12T12:00:00Z",
        }, headers=auth_header(coach_token))
        event_id = er.get_json()["data"]["id"]
        return admin_token, coach_token, player_token, player, team_id, event_id

    def test_mark_attendance_as_coach(self, client, db):
        _, coach_token, _, player, _, event_id = self._setup(client)
        resp = client.post("/api/attendance/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "present",
        }, headers=auth_header(coach_token))
        assert resp.status_code == 201

    def test_update_attendance(self, client, db):
        _, coach_token, _, player, _, event_id = self._setup(client)
        client.post("/api/attendance/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "present",
        }, headers=auth_header(coach_token))
        resp = client.post("/api/attendance/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "absent",
        }, headers=auth_header(coach_token))
        assert resp.status_code == 200
        assert resp.get_json()["data"]["status"] == "absent"

    def test_attendance_invalid_status(self, client, db):
        _, coach_token, _, player, _, event_id = self._setup(client)
        resp = client.post("/api/attendance/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "late",
        }, headers=auth_header(coach_token))
        assert resp.status_code == 400

    def test_get_attendance_for_event(self, client, db):
        admin_token, coach_token, _, player, _, event_id = self._setup(client)
        client.post("/api/attendance/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "present",
        }, headers=auth_header(coach_token))
        resp = client.get(f"/api/attendance/event/{event_id}", headers=auth_header(admin_token))
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) == 1

    def test_player_cannot_list_attendance_for_event(self, client, db):
        _, _, player_token, _, _, event_id = self._setup(client)
        resp = client.get(f"/api/attendance/event/{event_id}", headers=auth_header(player_token))
        assert resp.status_code == 403

    def test_player_cannot_mark_attendance(self, client, db):
        _, _, player_token, player, _, event_id = self._setup(client)
        resp = client.post("/api/attendance/", json={
            "event_id": event_id, "player_user_id": player["id"], "status": "present",
        }, headers=auth_header(player_token))
        assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════
# ANNOUNCEMENT ROUTES
# ═══════════════════════════════════════════════════════════════

class TestAnnouncements:
    def _setup(self, client):
        admin_token, _ = make_user(client, "annadmin@test.com", "Ann Admin", "admin")
        coach_token, coach = make_user(client, "anncoach@test.com", "Ann Coach", "coach")
        tr = client.post("/api/teams/", json={"name": "Ann Team"}, headers=auth_header(admin_token))
        team_id = tr.get_json()["data"]["id"]
        client.post(f"/api/teams/{team_id}/coaches", json={"coach_user_id": coach["id"]},
                     headers=auth_header(admin_token))
        return admin_token, coach_token, team_id

    def test_create_announcement(self, client, db):
        _, coach_token, team_id = self._setup(client)
        resp = client.post("/api/announcements/", json={
            "team_id": team_id, "title": "Test Announcement", "message": "This is a test.",
        }, headers=auth_header(coach_token))
        assert resp.status_code == 201

    def test_create_announcement_missing_fields(self, client, db):
        _, coach_token, _ = self._setup(client)
        resp = client.post("/api/announcements/", json={}, headers=auth_header(coach_token))
        assert resp.status_code == 400

    def test_list_announcements(self, client, db):
        admin_token, coach_token, team_id = self._setup(client)
        client.post("/api/announcements/", json={
            "team_id": team_id, "title": "A1", "message": "Msg",
        }, headers=auth_header(coach_token))
        resp = client.get("/api/announcements/", headers=auth_header(admin_token))
        assert resp.status_code == 200

    def test_get_announcement_by_id(self, client, db):
        admin_token, coach_token, team_id = self._setup(client)
        r = client.post("/api/announcements/", json={
            "team_id": team_id, "title": "Find Me", "message": "Msg",
        }, headers=auth_header(coach_token))
        aid = r.get_json()["data"]["id"]
        resp = client.get(f"/api/announcements/{aid}", headers=auth_header(admin_token))
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════
# NOTIFICATION ROUTES
# ═══════════════════════════════════════════════════════════════

class TestNotifications:
    def _setup(self, client):
        admin_token, _ = make_user(client, "notifadmin@test.com", "Notif Admin", "admin")
        coach_token, coach = make_user(client, "notifcoach@test.com", "Notif Coach", "coach")
        player_token, player = make_user(client, "notifplayer@test.com", "Notif Player", "player")
        tr = client.post("/api/teams/", json={"name": "Notif Team"}, headers=auth_header(admin_token))
        team_id = tr.get_json()["data"]["id"]
        client.post(f"/api/teams/{team_id}/coaches", json={"coach_user_id": coach["id"]},
                     headers=auth_header(admin_token))
        client.post(f"/api/teams/{team_id}/players", json={"player_user_id": player["id"]},
                     headers=auth_header(admin_token))
        # Announcement triggers notification
        client.post("/api/announcements/", json={
            "team_id": team_id, "title": "Notif Ann", "message": "Msg",
        }, headers=auth_header(coach_token))
        return admin_token, coach_token, player_token, player

    def test_list_notifications(self, client, db):
        _, _, player_token, _ = self._setup(client)
        resp = client.get("/api/notifications/", headers=auth_header(player_token))
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) >= 1

    def test_mark_notification_read(self, client, db):
        _, _, player_token, _ = self._setup(client)
        resp = client.get("/api/notifications/", headers=auth_header(player_token))
        notif_id = resp.get_json()["data"][0]["id"]
        resp = client.patch(f"/api/notifications/{notif_id}/read", headers=auth_header(player_token))
        assert resp.status_code == 200
        assert resp.get_json()["data"]["is_read"] is True

    def test_mark_all_read(self, client, db):
        _, _, player_token, _ = self._setup(client)
        resp = client.patch("/api/notifications/read-all", headers=auth_header(player_token))
        assert resp.status_code == 200

    def test_notifications_empty_for_new_user(self, client, db):
        token, _ = make_user(client, "empty@test.com", "Empty", "player")
        resp = client.get("/api/notifications/", headers=auth_header(token))
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) == 0

    def test_send_reminders_invalid_hours(self, client, db):
        admin_token, _, _, _ = self._setup(client)
        resp = client.post(
            "/api/notifications/send-reminders",
            json={"hours_ahead": "abc"},
            headers=auth_header(admin_token),
        )
        assert resp.status_code == 400


class TestBlockedDatesAndDiscounts:
    def test_single_event_rejected_on_blocked_date(self, client, db):
        admin_token, _ = make_user(client, "blkadmin@test.com", "Block Admin", "admin")
        coach_token, coach = make_user(client, "blkcoach@test.com", "Block Coach", "coach")

        team_resp = client.post("/api/teams/", json={"name": "Blocked Team"}, headers=auth_header(admin_token))
        team_id = team_resp.get_json()["data"]["id"]
        client.post(
            f"/api/teams/{team_id}/coaches",
            json={"coach_user_id": coach["id"]},
            headers=auth_header(admin_token),
        )

        client.post(
            "/api/blocked-dates/",
            json={
                "label": "Final Exams",
                "block_type": "exam",
                "start_date": "2026-05-10",
                "end_date": "2026-05-20",
            },
            headers=auth_header(admin_token),
        )

        resp = client.post(
            "/api/events/",
            json={
                "team_id": team_id,
                "title": "Blocked Practice",
                "event_type": "practice",
                "court": "Court A",
                "start_time": "2026-05-12T10:00:00Z",
                "end_time": "2026-05-12T11:00:00Z",
            },
            headers=auth_header(coach_token),
        )
        assert resp.status_code == 409

    def test_targeted_discount_applies_only_to_selected_player(self, client, db):
        admin_token, admin_user = make_user(client, "discadmin@test.com", "Disc Admin", "admin")
        _, parent = make_user(client, "discparent@test.com", "Disc Parent", "parent")
        _, player_a = make_user(client, "discplayera@test.com", "Disc Player A", "player")
        _, player_b = make_user(client, "discplayerb@test.com", "Disc Player B", "player")

        team_resp = client.post("/api/teams/", json={"name": "Discount Team"}, headers=auth_header(admin_token))
        team_id = team_resp.get_json()["data"]["id"]
        client.post(f"/api/teams/{team_id}/players", json={"player_user_id": player_a["id"]}, headers=auth_header(admin_token))
        client.post(f"/api/teams/{team_id}/players", json={"player_user_id": player_b["id"]}, headers=auth_header(admin_token))

        client.post(
            "/api/parent-child/",
            json={"parent_user_id": parent["id"], "child_user_id": player_a["id"]},
            headers=auth_header(admin_token),
        )
        client.post(
            "/api/parent-child/",
            json={"parent_user_id": parent["id"], "child_user_id": player_b["id"]},
            headers=auth_header(admin_token),
        )

        form_resp = client.post(
            "/api/registrations/forms",
            json={
                "title": "Discount Form",
                "team_id": team_id,
                "fee": 200,
                "created_by_user_id": admin_user["id"],
            },
            headers=auth_header(admin_token),
        )
        form_id = form_resp.get_json()["data"]["id"]

        disc_resp = client.post(
            "/api/invoices/discounts",
            json={
                "form_id": form_id,
                "label": "Targeted Aid",
                "discount_type": "percentage",
                "value": 50,
                "target_user_id": player_a["id"],
            },
            headers=auth_header(admin_token),
        )
        discount_id = disc_resp.get_json()["data"]["id"]

        reg_a = client.post(
            "/api/registrations/",
            json={
                "form_id": form_id,
                "player_user_id": player_a["id"],
                "parent_user_id": parent["id"],
                "discount_id": discount_id,
            },
            headers=auth_header(admin_token),
        )
        assert reg_a.status_code == 201
        assert reg_a.get_json()["data"]["invoice"]["amount"] == 100

        reg_b = client.post(
            "/api/registrations/",
            json={
                "form_id": form_id,
                "player_user_id": player_b["id"],
                "parent_user_id": parent["id"],
            },
            headers=auth_header(admin_token),
        )
        assert reg_b.status_code == 201
        assert reg_b.get_json()["data"]["invoice"]["amount"] == 200
