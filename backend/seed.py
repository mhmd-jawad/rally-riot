"""Seed the database with demo data."""
from extensions import db
from models import (
    User, Team, TeamCoach, TeamPlayer, ParentChildLink,
    Event, RegistrationForm, Registration, Invoice, RSVP,
    AttendanceRecord, Announcement, Notification, WaiverFile,
)
from auth import hash_password
from datetime import datetime, timedelta, timezone


def seed():
    """Populate the DB with sample data. Safe to call on an existing DB."""
    if User.query.first():
        print("⚠  Database already seeded – skipping.")
        return

    now = datetime.now(timezone.utc)

    # ── Users ──────────────────────────────────────────────────
    admin = User(full_name="Admin User", email="admin@rallyriot.com",
                 password_hash=hash_password("Password1!"), role="admin")
    coach1 = User(full_name="Coach Williams", email="coach@rallyriot.com",
                  password_hash=hash_password("Password1!"), role="coach")
    coach2 = User(full_name="Coach Johnson", email="coach2@rallyriot.com",
                  password_hash=hash_password("Password1!"), role="coach")
    player1 = User(full_name="Player Alex", email="player1@rallyriot.com",
                   password_hash=hash_password("Password1!"), role="player")
    player2 = User(full_name="Player Jordan", email="player2@rallyriot.com",
                   password_hash=hash_password("Password1!"), role="player")
    player3 = User(full_name="Player Casey", email="player3@rallyriot.com",
                   password_hash=hash_password("Password1!"), role="player")
    parent1 = User(full_name="Parent Kim", email="parent1@rallyriot.com",
                   password_hash=hash_password("Password1!"), role="parent")
    parent2 = User(full_name="Parent Sam", email="parent2@rallyriot.com",
                   password_hash=hash_password("Password1!"), role="parent")

    db.session.add_all([admin, coach1, coach2, player1, player2, player3, parent1, parent2])
    db.session.flush()

    # ── Parent-Child Links ────────────────────────────────────
    db.session.add(ParentChildLink(parent_user_id=parent1.id, child_user_id=player1.id))
    db.session.add(ParentChildLink(parent_user_id=parent2.id, child_user_id=player2.id))
    db.session.flush()

    # ── Teams ─────────────────────────────────────────────────
    team1 = Team(name="Thunder U14", age_group="U14", skill_level="intermediate")
    team2 = Team(name="Lightning U16", age_group="U16", skill_level="advanced")
    db.session.add_all([team1, team2])
    db.session.flush()

    db.session.add(TeamCoach(team_id=team1.id, coach_user_id=coach1.id))
    db.session.add(TeamCoach(team_id=team2.id, coach_user_id=coach2.id))
    db.session.add(TeamPlayer(team_id=team1.id, player_user_id=player1.id))
    db.session.add(TeamPlayer(team_id=team1.id, player_user_id=player2.id))
    db.session.add(TeamPlayer(team_id=team2.id, player_user_id=player3.id))
    db.session.flush()

    # ── Events ────────────────────────────────────────────────
    ev1 = Event(
        team_id=team1.id, created_by_user_id=coach1.id,
        event_type="practice", title="Morning Practice",
        description="Regular practice session",
        court="Court A",
        start_time=now + timedelta(days=1, hours=8),
        end_time=now + timedelta(days=1, hours=10),
    )
    ev2 = Event(
        team_id=team1.id, created_by_user_id=coach1.id,
        event_type="match", title="Friendly Match",
        description="vs Riverside Rockets",
        court="Court B",
        start_time=now + timedelta(days=3, hours=14),
        end_time=now + timedelta(days=3, hours=16),
    )
    ev3 = Event(
        team_id=team2.id, created_by_user_id=coach2.id,
        event_type="tryout", title="Open Tryouts",
        court="Court C",
        start_time=now + timedelta(days=5, hours=9),
        end_time=now + timedelta(days=5, hours=11),
    )
    db.session.add_all([ev1, ev2, ev3])
    db.session.flush()

    # ── Registration Forms ────────────────────────────────────
    form1 = RegistrationForm(
        title="Spring 2025 Registration", description="Registration for spring season",
        team_id=team1.id, season="Spring 2025", fee=150.00,
        is_active=True, created_by_user_id=admin.id,
    )
    form2 = RegistrationForm(
        title="Summer 2025 Tryouts", description="Open tryout registration",
        team_id=team2.id, season="Summer 2025", fee=50.00,
        is_active=True, created_by_user_id=admin.id,
    )
    db.session.add_all([form1, form2])
    db.session.flush()

    # ── Registrations ─────────────────────────────────────────
    reg1 = Registration(
        form_id=form1.id, player_user_id=player1.id,
        parent_user_id=parent1.id, status="approved",
    )
    reg2 = Registration(
        form_id=form1.id, player_user_id=player2.id,
        parent_user_id=parent2.id, status="pending",
    )
    db.session.add_all([reg1, reg2])
    db.session.flush()

    # ── Invoices ──────────────────────────────────────────────
    inv1 = Invoice(
        registration_id=reg1.id, parent_user_id=parent1.id,
        player_user_id=player1.id, amount=150.00, amount_paid=150.00,
        status="paid", due_date=(now + timedelta(days=14)).date().isoformat(),
    )
    inv2 = Invoice(
        registration_id=reg2.id, parent_user_id=parent2.id,
        player_user_id=player2.id, amount=150.00, amount_paid=0.00,
        status="unpaid", due_date=(now + timedelta(days=14)).date().isoformat(),
    )
    db.session.add_all([inv1, inv2])
    db.session.flush()

    # ── RSVPs ─────────────────────────────────────────────────
    db.session.add(RSVP(event_id=ev1.id, player_user_id=player1.id,
                        responded_by_user_id=player1.id, status="attending"))
    db.session.add(RSVP(event_id=ev1.id, player_user_id=player2.id,
                        responded_by_user_id=parent2.id, status="not_attending"))
    db.session.flush()

    # ── Attendance ────────────────────────────────────────────
    db.session.add(AttendanceRecord(event_id=ev1.id, player_user_id=player1.id,
                                    marked_by_user_id=coach1.id, status="present"))
    db.session.flush()

    # ── Announcements ─────────────────────────────────────────
    ann1 = Announcement(
        team_id=team1.id, coach_user_id=coach1.id,
        title="Welcome to the team!", message="We are excited to start the season.",
    )
    db.session.add(ann1)
    db.session.flush()

    # ── Notifications ─────────────────────────────────────────
    db.session.add(Notification(
        user_id=player1.id, type="announcement", title="New Announcement",
        message="Coach posted a new announcement.", is_read=False,
    ))
    db.session.add(Notification(
        user_id=parent1.id, type="invoice", title="Invoice Due",
        message="You have a pending invoice.", is_read=False,
    ))

    db.session.commit()
    print("✅ Database seeded with demo data.")


if __name__ == "__main__":
    from app import create_app
    app = create_app()
    with app.app_context():
        db.create_all()
        seed()
