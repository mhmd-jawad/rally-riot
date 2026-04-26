"""Pytest configuration and fixtures."""
import os
import sys
import pytest
import tempfile

# Ensure backend is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from extensions import db as _db
from config import Config


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    UPLOAD_DIR = tempfile.mkdtemp()
    JWT_SECRET_KEY = "test-secret-key-with-sufficient-length-123456"


@pytest.fixture(scope="session")
def app():
    """Create application for the tests."""
    app = create_app(TestConfig)
    return app


@pytest.fixture(scope="function")
def db(app):
    """Create a fresh database for each test."""
    with app.app_context():
        _db.create_all()
        from seed import seed
        seed()
        yield _db
        _db.session.remove()
        _db.drop_all()


@pytest.fixture(scope="function")
def client(app, db):
    """A test client for the app."""
    return app.test_client()


@pytest.fixture
def seed_users(client):
    """Create the standard set of users and return their tokens."""
    users = {}
    roles = [
        ("admin@test.com", "Admin User", "admin"),
        ("coach@test.com", "Coach Thompson", "coach"),
        ("coach2@test.com", "Coach Williams", "coach"),
        ("player@test.com", "Alex Johnson", "player"),
        ("player2@test.com", "Sam Carter", "player"),
        ("player3@test.com", "Jordan Lee", "player"),
        ("parent@test.com", "Pat Johnson", "parent"),
        ("parent2@test.com", "Robin Carter", "parent"),
    ]

    login_resp = client.post("/api/auth/login", json={
        "email": "admin@rallyriot.com",
        "password": "Demo1234!",
    })
    admin_token = login_resp.get_json()["data"]["token"]

    for email, name, role in roles:
        resp = client.post("/api/users/", json={
            "email": email,
            "password": "password123",
            "full_name": name,
            "role": role,
        }, headers=auth_header(admin_token))
        assert resp.status_code in (200, 201), f"Failed to create {email}: {resp.get_json()}"

    # Login each and collect tokens
    for email, name, role in roles:
        resp = client.post("/api/auth/login", json={
            "email": email,
            "password": "password123",
        })
        data = resp.get_json()
        assert data["success"], f"Login failed for {email}: {data}"
        key = role if role not in users else f"{role}2" if f"{role}2" not in users else f"{role}3"
        users[key] = {
            "token": data["data"]["token"],
            "user": data["data"]["user"],
            "email": email,
        }

    return users


def auth_header(token):
    """Helper to build Authorization header."""
    return {"Authorization": f"Bearer {token}"}
