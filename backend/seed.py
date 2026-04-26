"""Seed the database with demo data — professor demo build.

Demo narrative
--------------
1. Log in as Admin (admin@rallyriot.com / Password1!)
2. Show the Admin dashboard — teams, events, registrations, finance all exist as
   background data to make the club feel real.
3. LIVE: Admin creates a new Coach account → assigns them to Thunder U16.
4. LIVE: Admin creates a new Player account → assigns them to Thunder U16.
5. Log in as the newly created Coach → see their team, create an event, mark attendance.
6. Log in as the newly created Player → see their schedule, RSVP.
7. Switch to Parent accounts (ahmad / fatima / nour) to show payments, child schedule.

Coaches / players in the sample data are NOT pre-created as login accounts.
All historical events, attendance records, and community posts are authored by the
admin user so the data looks real without requiring separate coach/player logins to
already exist.
"""
from extensions import db
from models import (
    User, Team, TeamCoach, TeamPlayer, ParentChildLink,
    Event, RegistrationForm, Registration, Invoice, RSVP,
    AttendanceRecord, Announcement, Notification, WaiverFile,
    Discount, InstallmentPlan, InstallmentPayment,
)
from models_community import (
    CommunityPost, CommunityReply, CommunityPoll,
    CommunityPollOption, CommunityPollVote,
)
from auth import hash_password
from datetime import datetime, timedelta

PASSWORD = "Password1!"

# Only accounts that must survive an ensure_demo_accounts() repair pass.
# Coaches and players are NOT listed here — they are created live during the demo.
DEMO_USERS = [
    ("Mohammad Al-Admin", "admin@rallyriot.com",   "admin"),
    ("Ahmad Al-Rashid",   "ahmad@rallyriot.com",   "parent"),
    ("Fatima Khalil",     "fatima@rallyriot.com",  "parent"),
    ("Nour Mansour",      "nour@rallyriot.com",    "parent"),
]


def ensure_demo_accounts():
    """Create or repair the known demo accounts without touching other users."""
    changed = False
    password_hash = hash_password(PASSWORD)

    for full_name, email, role in DEMO_USERS:
        user = User.query.filter_by(email=email).first()
        if user is None:
            db.session.add(User(
                full_name=full_name,
                email=email,
                password_hash=password_hash,
                role=role,
                is_active=True,
            ))
            changed = True
            continue

        updates = {
            "full_name": full_name,
            "role": role,
            "password_hash": password_hash,
            "is_active": True,
        }
        for field, value in updates.items():
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed = True

    if changed:
        db.session.commit()
    return changed


def seed():
    """Populate the DB with rich demo data. Safe to call on an existing DB."""
    if User.query.first():
        if ensure_demo_accounts():
            print("Demo accounts created or repaired.")
        print("Database already seeded - skipping.")
        return

    now = datetime.utcnow()

    # ══════════════════════════════════════════════════════════════
    # USERS
    # Only admin + parents are pre-seeded.
    # Coaches and players will be created LIVE during the demo.
    # ══════════════════════════════════════════════════════════════

    admin = User(full_name="Mohammad Al-Admin", email="admin@rallyriot.com",
                 password_hash=hash_password(PASSWORD), role="admin")

    parent_ahmad  = User(full_name="Ahmad Al-Rashid",  email="ahmad@rallyriot.com",
                         password_hash=hash_password(PASSWORD), role="parent", wallet_balance=500.00)
    parent_fatima = User(full_name="Fatima Khalil",    email="fatima@rallyriot.com",
                         password_hash=hash_password(PASSWORD), role="parent", wallet_balance=300.00)
    parent_nour   = User(full_name="Nour Mansour",     email="nour@rallyriot.com",
                         password_hash=hash_password(PASSWORD), role="parent", wallet_balance=50.00)

    db.session.add_all([admin, parent_ahmad, parent_fatima, parent_nour])
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # TEAMS  (exist before any coach/player is assigned)
    # ══════════════════════════════════════════════════════════════
    team_thunder   = Team(name="Thunder U16",      age_group="U16", skill_level="Advanced",     priority_level=5)
    team_lightning = Team(name="Lightning U14",    age_group="U14", skill_level="Intermediate", priority_level=4)
    team_storm     = Team(name="Storm Beginners",  age_group="U12", skill_level="Beginner",      priority_level=2)
    db.session.add_all([team_thunder, team_lightning, team_storm])
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # PLACEHOLDER PLAYERS for historical data
    # These are internal DB records only — no login credentials.
    # The admin will create real loginable players live during the demo.
    # ══════════════════════════════════════════════════════════════
    _ph = hash_password("disabled-no-login-$$")  # unusable password
    ph_omar  = User(full_name="Omar Al-Rashid (sample)",  email="omar.sample@rallyriot.internal",
                    password_hash=_ph, role="player", is_active=False)
    ph_sara  = User(full_name="Sara Khalil (sample)",     email="sara.sample@rallyriot.internal",
                    password_hash=_ph, role="player", is_active=False)
    ph_ziad  = User(full_name="Ziad Nasser (sample)",     email="ziad.sample@rallyriot.internal",
                    password_hash=_ph, role="player", is_active=False)
    ph_lena  = User(full_name="Lena Farouk (sample)",     email="lena.sample@rallyriot.internal",
                    password_hash=_ph, role="player", is_active=False)
    ph_karim = User(full_name="Karim Mansour (sample)",   email="karim.sample@rallyriot.internal",
                    password_hash=_ph, role="player", is_active=False)
    db.session.add_all([ph_omar, ph_sara, ph_ziad, ph_lena, ph_karim])
    db.session.flush()

    # Parent-child links for sample players (used for invoices / registration history)
    db.session.add(ParentChildLink(parent_user_id=parent_ahmad.id,  child_user_id=ph_omar.id))
    db.session.add(ParentChildLink(parent_user_id=parent_fatima.id, child_user_id=ph_sara.id))
    db.session.add(ParentChildLink(parent_user_id=parent_nour.id,   child_user_id=ph_karim.id))
    db.session.add(ParentChildLink(parent_user_id=parent_ahmad.id,  child_user_id=ph_ziad.id))
    db.session.flush()

    # Team assignments for sample players
    db.session.add(TeamPlayer(team_id=team_thunder.id,   player_user_id=ph_omar.id))
    db.session.add(TeamPlayer(team_id=team_thunder.id,   player_user_id=ph_sara.id))
    db.session.add(TeamPlayer(team_id=team_thunder.id,   player_user_id=ph_ziad.id))
    db.session.add(TeamPlayer(team_id=team_lightning.id, player_user_id=ph_lena.id))
    db.session.add(TeamPlayer(team_id=team_lightning.id, player_user_id=ph_karim.id))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # EVENTS — all authored by admin so no coach login is required
    # ══════════════════════════════════════════════════════════════

    ev_past1 = Event(
        team_id=team_thunder.id, created_by_user_id=admin.id,
        event_type="practice", title="Pre-Season Warm-Up",
        description="First practice of the season — fitness drills and passing.",
        court="Court A",
        start_time=now - timedelta(days=10, hours=-9),
        end_time=now   - timedelta(days=10, hours=-11),
    )
    ev_past2 = Event(
        team_id=team_thunder.id, created_by_user_id=admin.id,
        event_type="match", title="Friendly vs Riverside FC",
        description="Pre-season friendly match.",
        court="Court B",
        start_time=now - timedelta(days=5, hours=-14),
        end_time=now   - timedelta(days=5, hours=-16),
    )
    ev_practice1 = Event(
        team_id=team_thunder.id, created_by_user_id=admin.id,
        event_type="practice", title="Tuesday Morning Practice",
        description="Serve and receive drills. Bring water and knee pads.",
        court="Court A",
        start_time=now + timedelta(days=1, hours=8),
        end_time=now   + timedelta(days=1, hours=10),
    )
    ev_match1 = Event(
        team_id=team_thunder.id, created_by_user_id=admin.id,
        event_type="match", title="League Match vs Eagles",
        description="Official league game. Arrive 30 min early for warm-up.",
        court="Court B",
        start_time=now + timedelta(days=3, hours=14),
        end_time=now   + timedelta(days=3, hours=16),
    )
    ev_tryout = Event(
        team_id=team_lightning.id, created_by_user_id=admin.id,
        event_type="tryout", title="Lightning U14 Open Tryouts",
        description="Open tryout for new players. All skill levels welcome.",
        court="Court C",
        start_time=now + timedelta(days=5, hours=9),
        end_time=now   + timedelta(days=5, hours=11),
    )
    ev_practice2 = Event(
        team_id=team_lightning.id, created_by_user_id=admin.id,
        event_type="practice", title="Thursday Technique Session",
        description="Focus on blocking and spiking.",
        court="Court A",
        start_time=now + timedelta(days=6, hours=16),
        end_time=now   + timedelta(days=6, hours=18),
    )
    ev_tournament = Event(
        team_id=team_thunder.id, created_by_user_id=admin.id,
        event_type="tournament", title="City Cup Tournament",
        description="Annual city-wide volleyball tournament. Pool play starts at 9am.",
        court="Main Hall",
        start_time=now + timedelta(days=14, hours=9),
        end_time=now   + timedelta(days=14, hours=18),
    )

    db.session.add_all([ev_past1, ev_past2, ev_practice1, ev_match1,
                        ev_tryout, ev_practice2, ev_tournament])
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # REGISTRATION FORMS
    # ══════════════════════════════════════════════════════════════
    form_thunder = RegistrationForm(
        title="Thunder U16 — Spring Season 2026",
        description="Official registration for the Thunder U16 spring season. "
                    "Fee covers coaching, court rental, and jersey.",
        team_id=team_thunder.id, season="Spring 2026",
        fee=200.00, requires_waiver=True,
        is_active=True, created_by_user_id=admin.id,
    )
    form_lightning = RegistrationForm(
        title="Lightning U14 — Spring Season 2026",
        description="Registration for Lightning U14. Includes all home games and practices.",
        team_id=team_lightning.id, season="Spring 2026",
        fee=150.00, requires_waiver=False,
        is_active=True, created_by_user_id=admin.id,
    )
    form_tryout = RegistrationForm(
        title="Open Tryout Registration",
        description="Register to attend the U14 open tryouts. Free of charge.",
        team_id=team_lightning.id, season="Spring 2026",
        fee=0.00, requires_waiver=False,
        is_active=True, created_by_user_id=admin.id,
    )
    db.session.add_all([form_thunder, form_lightning, form_tryout])
    db.session.flush()

    db.session.add(Discount(
        form_id=form_thunder.id, label="Early Bird 10% Off",
        discount_type="percentage", value=10.0,
    ))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # REGISTRATIONS & INVOICES  (linked to sample placeholder players)
    # ══════════════════════════════════════════════════════════════

    # Omar — approved, paid in full
    reg_omar = Registration(
        form_id=form_thunder.id, player_user_id=ph_omar.id,
        parent_user_id=parent_ahmad.id, status="approved",
    )
    db.session.add(reg_omar)
    db.session.flush()
    inv_omar = Invoice(
        registration_id=reg_omar.id,
        parent_user_id=parent_ahmad.id, player_user_id=ph_omar.id,
        amount=180.00, amount_paid=180.00,
        status="paid",
        due_date=(now + timedelta(days=14)).date().isoformat(),
    )
    db.session.add(inv_omar)
    db.session.flush()

    # Sara — approved, installment plan (1 paid, 1 pending)
    reg_sara = Registration(
        form_id=form_thunder.id, player_user_id=ph_sara.id,
        parent_user_id=parent_fatima.id, status="approved",
    )
    db.session.add(reg_sara)
    db.session.flush()
    inv_sara = Invoice(
        registration_id=reg_sara.id,
        parent_user_id=parent_fatima.id, player_user_id=ph_sara.id,
        amount=180.00, amount_paid=90.00,
        status="unpaid",
        due_date=(now + timedelta(days=7)).date().isoformat(),
    )
    db.session.add(inv_sara)
    db.session.flush()
    plan_sara = InstallmentPlan(invoice_id=inv_sara.id, num_installments=2)
    db.session.add(plan_sara)
    db.session.flush()
    db.session.add(InstallmentPayment(
        plan_id=plan_sara.id, amount=90.00,
        due_date=(now - timedelta(days=7)).date().isoformat(),
        status="paid", paid_at=now - timedelta(days=6),
    ))
    db.session.add(InstallmentPayment(
        plan_id=plan_sara.id, amount=90.00,
        due_date=(now + timedelta(days=7)).date().isoformat(),
        status="unpaid",
    ))
    db.session.flush()

    # Ziad — pending approval
    reg_ziad = Registration(
        form_id=form_thunder.id, player_user_id=ph_ziad.id,
        parent_user_id=parent_ahmad.id, status="pending",
    )
    db.session.add(reg_ziad)
    db.session.flush()
    inv_ziad = Invoice(
        registration_id=reg_ziad.id,
        parent_user_id=parent_ahmad.id, player_user_id=ph_ziad.id,
        amount=180.00, amount_paid=0.00,
        status="unpaid",
        due_date=(now + timedelta(days=14)).date().isoformat(),
    )
    db.session.add(inv_ziad)
    db.session.flush()

    # Karim — approved, overdue invoice
    reg_karim = Registration(
        form_id=form_lightning.id, player_user_id=ph_karim.id,
        parent_user_id=parent_nour.id, status="approved",
    )
    db.session.add(reg_karim)
    db.session.flush()
    inv_karim = Invoice(
        registration_id=reg_karim.id,
        parent_user_id=parent_nour.id, player_user_id=ph_karim.id,
        amount=150.00, amount_paid=0.00,
        status="unpaid",
        due_date=(now - timedelta(days=5)).date().isoformat(),
    )
    db.session.add(inv_karim)
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # RSVPs  (sample players on upcoming events)
    # ══════════════════════════════════════════════════════════════
    db.session.add(RSVP(event_id=ev_practice1.id, player_user_id=ph_omar.id,
                        responded_by_user_id=parent_ahmad.id, status="attending"))
    db.session.add(RSVP(event_id=ev_practice1.id, player_user_id=ph_sara.id,
                        responded_by_user_id=parent_fatima.id, status="attending"))
    db.session.add(RSVP(event_id=ev_practice1.id, player_user_id=ph_ziad.id,
                        responded_by_user_id=parent_ahmad.id, status="not_attending"))
    db.session.add(RSVP(event_id=ev_match1.id, player_user_id=ph_omar.id,
                        responded_by_user_id=parent_ahmad.id, status="attending"))
    db.session.add(RSVP(event_id=ev_match1.id, player_user_id=ph_sara.id,
                        responded_by_user_id=parent_fatima.id, status="maybe"))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # ATTENDANCE  (past events — marked by admin)
    # ══════════════════════════════════════════════════════════════
    db.session.add(AttendanceRecord(event_id=ev_past1.id, player_user_id=ph_omar.id,
                                    marked_by_user_id=admin.id, status="present"))
    db.session.add(AttendanceRecord(event_id=ev_past1.id, player_user_id=ph_sara.id,
                                    marked_by_user_id=admin.id, status="present"))
    db.session.add(AttendanceRecord(event_id=ev_past1.id, player_user_id=ph_ziad.id,
                                    marked_by_user_id=admin.id, status="absent",
                                    absence_reason="Family trip"))
    db.session.add(AttendanceRecord(event_id=ev_past2.id, player_user_id=ph_omar.id,
                                    marked_by_user_id=admin.id, status="present"))
    db.session.add(AttendanceRecord(event_id=ev_past2.id, player_user_id=ph_sara.id,
                                    marked_by_user_id=admin.id, status="absent",
                                    absence_reason="Sick"))
    db.session.add(AttendanceRecord(event_id=ev_past2.id, player_user_id=ph_ziad.id,
                                    marked_by_user_id=admin.id, status="present"))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # ANNOUNCEMENTS  (authored by admin)
    # ══════════════════════════════════════════════════════════════
    ann1 = Announcement(
        team_id=team_thunder.id, coach_user_id=admin.id,
        title="Welcome to Spring Season 2026!",
        message="Excited to kick off the new season with Thunder U16. "
                "First practice is tomorrow at 8am on Court A. Come warmed up!",
        priority="high",
    )
    ann2 = Announcement(
        team_id=team_thunder.id, coach_user_id=admin.id,
        title="League Match This Thursday — Important",
        message="Reminder: league match vs Eagles on Thursday at 2pm, Court B. "
                "Please RSVP in the app so I can finalize the lineup. "
                "Jerseys are mandatory — no jersey, no play.",
        priority="high",
    )
    ann3 = Announcement(
        team_id=team_thunder.id, coach_user_id=admin.id,
        title="Court Change for Friday Practice",
        message="Friday's practice has moved from Court A to Court C due to maintenance. "
                "All other details remain the same.",
        priority="normal",
    )
    ann4 = Announcement(
        team_id=team_lightning.id, coach_user_id=admin.id,
        title="Tryouts Next Week — Spread the Word",
        message="Open tryouts for Lightning U14 are next week. "
                "Encourage any interested players to register through the app.",
        priority="normal",
    )
    db.session.add_all([ann1, ann2, ann3, ann4])
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # NOTIFICATIONS  (for parent accounts)
    # ══════════════════════════════════════════════════════════════
    db.session.add(Notification(
        user_id=parent_ahmad.id, type="registration", title="Registration Approved",
        message="Omar Al-Rashid's registration for Thunder U16 has been approved.", is_read=False,
    ))
    db.session.add(Notification(
        user_id=parent_ahmad.id, type="invoice", title="Invoice Paid",
        message="Invoice for Omar Al-Rashid — $180.00 has been marked as paid.", is_read=True,
    ))
    db.session.add(Notification(
        user_id=parent_fatima.id, type="invoice", title="Installment Due Soon",
        message="Second installment of $90.00 for Sara Khalil is due in 7 days.", is_read=False,
    ))
    db.session.add(Notification(
        user_id=parent_nour.id, type="invoice", title="Invoice Overdue",
        message="Invoice for Karim Mansour ($150.00) is overdue. Please pay as soon as possible.", is_read=False,
    ))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # COMMUNITY HUB  (admin posts stand-in for coaches/players)
    # ══════════════════════════════════════════════════════════════

    post_pinned = CommunityPost(
        team_id=team_thunder.id, author_user_id=admin.id,
        title="Season Rules & Code of Conduct",
        body="Welcome to the Thunder U16 community hub!\n\n"
             "Please keep all discussions respectful and on-topic.\n"
             "• No spam or off-topic posts.\n"
             "• Questions about training go in the 'question' category.\n"
             "• Share tips in the 'tip' category.\n\n"
             "Let's have a great season! — Admin Mohammad",
        category="general", is_pinned=True,
    )
    db.session.add(post_pinned)
    db.session.flush()
    db.session.add(CommunityReply(
        post_id=post_pinned.id, author_user_id=admin.id,
        body="All training tips will be posted here regularly. Stay tuned.",
    ))

    post_tip = CommunityPost(
        team_id=team_thunder.id, author_user_id=admin.id,
        title="Serving Tip: Use Your Whole Body",
        body="A lot of players only use their arm when serving. "
             "Remember — power comes from your legs and core. "
             "Plant your feet, rotate your hips, and follow through.",
        category="tip", is_pinned=False,
    )
    db.session.add(post_tip)
    db.session.flush()
    db.session.add(CommunityReply(
        post_id=post_tip.id, author_user_id=admin.id,
        body="Great feedback from last practice — keep working on this technique.",
    ))

    post_question = CommunityPost(
        team_id=team_thunder.id, author_user_id=admin.id,
        title="Best exercises to improve vertical jump?",
        body="We need better vertical for blocking. "
             "Recommendations: box jumps, jump squats, and calf raises. "
             "3 sets of 10 reps, 3x a week. Give it 4 weeks.",
        category="question", is_pinned=False,
    )
    db.session.add(post_question)
    db.session.flush()

    post_poll = CommunityPost(
        team_id=team_thunder.id, author_user_id=admin.id,
        title="Player of the Week — Vote Now!",
        body="After last week's fantastic performance in training and the friendly match, "
             "vote for who you think deserves Player of the Week!",
        category="poll", is_pinned=False,
    )
    db.session.add(post_poll)
    db.session.flush()
    poll = CommunityPoll(post_id=post_poll.id, question="Who is Player of the Week?")
    db.session.add(poll)
    db.session.flush()
    opt_omar = CommunityPollOption(poll_id=poll.id, label="Omar Al-Rashid")
    opt_sara  = CommunityPollOption(poll_id=poll.id, label="Sara Khalil")
    opt_ziad  = CommunityPollOption(poll_id=poll.id, label="Ziad Nasser")
    db.session.add_all([opt_omar, opt_sara, opt_ziad])
    db.session.flush()
    # Pre-seed votes using admin so the poll looks active
    db.session.add(CommunityPollVote(poll_id=poll.id, option_id=opt_omar.id, user_id=admin.id))
    db.session.flush()

    post_lightning = CommunityPost(
        team_id=team_lightning.id, author_user_id=admin.id,
        title="Tryout Preparation Tips",
        body="For everyone attending the open tryouts next week:\n"
             "• Get good sleep the night before.\n"
             "• Warm up for at least 15 minutes.\n"
             "• Focus on fundamentals — passing, setting, serving.\n"
             "• We're looking for attitude and effort, not perfection.",
        category="tip", is_pinned=True,
    )
    db.session.add(post_lightning)
    db.session.flush()
    db.session.add(CommunityReply(
        post_id=post_lightning.id, author_user_id=admin.id,
        body="See you at tryouts — arrive early to warm up!",
    ))
    db.session.flush()

    db.session.commit()
    print("Demo database seeded successfully.")
    print()
    print("  Password for all accounts: Password1!")
    print()
    print("  ADMIN  -> admin@rallyriot.com")
    print()
    print("  PARENTS (pre-seeded, can log in immediately):")
    print("    ahmad@rallyriot.com   (children: Omar, Ziad — paid + pending invoice)")
    print("    fatima@rallyriot.com  (child: Sara — installment plan)")
    print("    nour@rallyriot.com    (child: Karim — overdue invoice)")
    print()
    print("  COACHES / PLAYERS: create live during the demo via Admin > Users")
    print("    Suggested demo coach:  coach@rallyriot.com / Password1!")
    print("    Suggested demo player: player@rallyriot.com / Password1!")


if __name__ == "__main__":
    from app import create_app
    app = create_app()
    with app.app_context():
        db.create_all()
        seed()
