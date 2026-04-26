"""Seed the database with demo data — professor demo build."""
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

DEMO_USERS = [
    ("Mohammad Al-Admin", "admin@rallyriot.com", "admin"),
    ("Ali Hassan", "ali@rallyriot.com", "coach"),
    ("Haydar Karimi", "haydar@rallyriot.com", "coach"),
    ("Omar Al-Rashid", "omar@rallyriot.com", "player"),
    ("Sara Khalil", "sara@rallyriot.com", "player"),
    ("Ziad Nasser", "ziad@rallyriot.com", "player"),
    ("Lena Farouk", "lena@rallyriot.com", "player"),
    ("Karim Mansour", "karim@rallyriot.com", "player"),
    ("Ahmad Al-Rashid", "ahmad@rallyriot.com", "parent"),
    ("Fatima Khalil", "fatima@rallyriot.com", "parent"),
    ("Nour Mansour", "nour@rallyriot.com", "parent"),
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
    # ══════════════════════════════════════════════════════════════

    # Admin
    admin = User(full_name="Mohammad Al-Admin", email="admin@rallyriot.com",
                 password_hash=hash_password(PASSWORD), role="admin")

    # Coaches
    coach_ali = User(full_name="Ali Hassan", email="ali@rallyriot.com",
                     password_hash=hash_password(PASSWORD), role="coach")
    coach_haydar = User(full_name="Haydar Karimi", email="haydar@rallyriot.com",
                        password_hash=hash_password(PASSWORD), role="coach")

    # Players
    player_omar = User(full_name="Omar Al-Rashid", email="omar@rallyriot.com",
                       password_hash=hash_password(PASSWORD), role="player")
    player_sara = User(full_name="Sara Khalil", email="sara@rallyriot.com",
                       password_hash=hash_password(PASSWORD), role="player")
    player_ziad = User(full_name="Ziad Nasser", email="ziad@rallyriot.com",
                       password_hash=hash_password(PASSWORD), role="player")
    player_lena = User(full_name="Lena Farouk", email="lena@rallyriot.com",
                       password_hash=hash_password(PASSWORD), role="player")
    player_karim = User(full_name="Karim Mansour", email="karim@rallyriot.com",
                        password_hash=hash_password(PASSWORD), role="player")

    # Parents
    parent_ahmad = User(full_name="Ahmad Al-Rashid", email="ahmad@rallyriot.com",
                        password_hash=hash_password(PASSWORD), role="parent")
    parent_fatima = User(full_name="Fatima Khalil", email="fatima@rallyriot.com",
                         password_hash=hash_password(PASSWORD), role="parent")
    parent_nour = User(full_name="Nour Mansour", email="nour@rallyriot.com",
                       password_hash=hash_password(PASSWORD), role="parent")

    db.session.add_all([
        admin,
        coach_ali, coach_haydar,
        player_omar, player_sara, player_ziad, player_lena, player_karim,
        parent_ahmad, parent_fatima, parent_nour,
    ])
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # PARENT-CHILD LINKS
    # Demonstrates: parent can view child schedule, RSVP, pay invoices
    # ══════════════════════════════════════════════════════════════
    db.session.add(ParentChildLink(parent_user_id=parent_ahmad.id, child_user_id=player_omar.id))
    db.session.add(ParentChildLink(parent_user_id=parent_fatima.id, child_user_id=player_sara.id))
    db.session.add(ParentChildLink(parent_user_id=parent_nour.id,   child_user_id=player_karim.id))
    # Ahmad also linked to Sara to demo one parent with two children
    db.session.add(ParentChildLink(parent_user_id=parent_ahmad.id, child_user_id=player_ziad.id))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # TEAMS
    # ══════════════════════════════════════════════════════════════
    team_thunder = Team(name="Thunder U16", age_group="U16",
                        skill_level="Advanced", priority_level=5)
    team_lightning = Team(name="Lightning U14", age_group="U14",
                          skill_level="Intermediate", priority_level=4)
    team_storm = Team(name="Storm Beginners", age_group="U12",
                      skill_level="Beginner", priority_level=2)
    db.session.add_all([team_thunder, team_lightning, team_storm])
    db.session.flush()

    # Coach assignments
    db.session.add(TeamCoach(team_id=team_thunder.id,   coach_user_id=coach_ali.id))
    db.session.add(TeamCoach(team_id=team_lightning.id, coach_user_id=coach_haydar.id))
    db.session.add(TeamCoach(team_id=team_storm.id,     coach_user_id=coach_ali.id))

    # Player assignments
    db.session.add(TeamPlayer(team_id=team_thunder.id,   player_user_id=player_omar.id))
    db.session.add(TeamPlayer(team_id=team_thunder.id,   player_user_id=player_sara.id))
    db.session.add(TeamPlayer(team_id=team_thunder.id,   player_user_id=player_ziad.id))
    db.session.add(TeamPlayer(team_id=team_lightning.id, player_user_id=player_lena.id))
    db.session.add(TeamPlayer(team_id=team_lightning.id, player_user_id=player_karim.id))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # EVENTS — past + upcoming to demo all states
    # ══════════════════════════════════════════════════════════════

    # Past events (for attendance history)
    ev_past1 = Event(
        team_id=team_thunder.id, created_by_user_id=coach_ali.id,
        event_type="practice", title="Pre-Season Warm-Up",
        description="First practice of the season — fitness drills and passing.",
        court="Court A",
        start_time=now - timedelta(days=10, hours=-9),
        end_time=now   - timedelta(days=10, hours=-11),
    )
    ev_past2 = Event(
        team_id=team_thunder.id, created_by_user_id=coach_ali.id,
        event_type="match", title="Friendly vs Riverside FC",
        description="Pre-season friendly match.",
        court="Court B",
        start_time=now - timedelta(days=5, hours=-14),
        end_time=now   - timedelta(days=5, hours=-16),
    )

    # Upcoming events
    ev_practice1 = Event(
        team_id=team_thunder.id, created_by_user_id=coach_ali.id,
        event_type="practice", title="Tuesday Morning Practice",
        description="Serve and receive drills. Bring water and knee pads.",
        court="Court A",
        start_time=now + timedelta(days=1, hours=8),
        end_time=now   + timedelta(days=1, hours=10),
    )
    ev_match1 = Event(
        team_id=team_thunder.id, created_by_user_id=coach_ali.id,
        event_type="match", title="League Match vs Eagles",
        description="Official league game. Arrive 30 min early for warm-up.",
        court="Court B",
        start_time=now + timedelta(days=3, hours=14),
        end_time=now   + timedelta(days=3, hours=16),
    )
    ev_tryout = Event(
        team_id=team_lightning.id, created_by_user_id=coach_haydar.id,
        event_type="tryout", title="Lightning U14 Open Tryouts",
        description="Open tryout for new players. All skill levels welcome.",
        court="Court C",
        start_time=now + timedelta(days=5, hours=9),
        end_time=now   + timedelta(days=5, hours=11),
    )
    ev_practice2 = Event(
        team_id=team_lightning.id, created_by_user_id=coach_haydar.id,
        event_type="practice", title="Thursday Technique Session",
        description="Focus on blocking and spiking.",
        court="Court A",
        start_time=now + timedelta(days=6, hours=16),
        end_time=now   + timedelta(days=6, hours=18),
    )
    ev_tournament = Event(
        team_id=team_thunder.id, created_by_user_id=coach_ali.id,
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

    # Discount on Thunder form to demo discount feature
    db.session.add(Discount(
        form_id=form_thunder.id, label="Early Bird 10% Off",
        discount_type="percentage", value=10.0,
    ))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # REGISTRATIONS & INVOICES
    # Shows: approved (paid), approved (installments), pending, rejected
    # ══════════════════════════════════════════════════════════════

    # Omar (Thunder) — approved, paid in full
    reg_omar = Registration(
        form_id=form_thunder.id, player_user_id=player_omar.id,
        parent_user_id=parent_ahmad.id, status="approved",
    )
    db.session.add(reg_omar)
    db.session.flush()
    inv_omar = Invoice(
        registration_id=reg_omar.id,
        parent_user_id=parent_ahmad.id, player_user_id=player_omar.id,
        amount=180.00, amount_paid=180.00,   # 200 - 10% discount = 180
        status="paid",
        due_date=(now + timedelta(days=14)).date().isoformat(),
    )
    db.session.add(inv_omar)
    db.session.flush()

    # Sara (Thunder) — approved, installment plan (2 payments, 1 paid 1 pending)
    reg_sara = Registration(
        form_id=form_thunder.id, player_user_id=player_sara.id,
        parent_user_id=parent_fatima.id, status="approved",
    )
    db.session.add(reg_sara)
    db.session.flush()
    inv_sara = Invoice(
        registration_id=reg_sara.id,
        parent_user_id=parent_fatima.id, player_user_id=player_sara.id,
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

    # Ziad (Thunder) — pending approval (shows admin approve/reject workflow)
    reg_ziad = Registration(
        form_id=form_thunder.id, player_user_id=player_ziad.id,
        parent_user_id=parent_ahmad.id, status="pending",
    )
    db.session.add(reg_ziad)
    db.session.flush()
    inv_ziad = Invoice(
        registration_id=reg_ziad.id,
        parent_user_id=parent_ahmad.id, player_user_id=player_ziad.id,
        amount=180.00, amount_paid=0.00,
        status="unpaid",
        due_date=(now + timedelta(days=14)).date().isoformat(),
    )
    db.session.add(inv_ziad)
    db.session.flush()

    # Karim (Lightning) — approved, overdue invoice (for demo of overdue highlighting)
    reg_karim = Registration(
        form_id=form_lightning.id, player_user_id=player_karim.id,
        parent_user_id=parent_nour.id, status="approved",
    )
    db.session.add(reg_karim)
    db.session.flush()
    inv_karim = Invoice(
        registration_id=reg_karim.id,
        parent_user_id=parent_nour.id, player_user_id=player_karim.id,
        amount=150.00, amount_paid=0.00,
        status="unpaid",
        due_date=(now - timedelta(days=5)).date().isoformat(),   # overdue!
    )
    db.session.add(inv_karim)
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # RSVPs
    # ══════════════════════════════════════════════════════════════
    # Upcoming practice — mixed RSVPs
    db.session.add(RSVP(event_id=ev_practice1.id, player_user_id=player_omar.id,
                        responded_by_user_id=player_omar.id, status="attending"))
    db.session.add(RSVP(event_id=ev_practice1.id, player_user_id=player_sara.id,
                        responded_by_user_id=parent_fatima.id, status="attending"))
    db.session.add(RSVP(event_id=ev_practice1.id, player_user_id=player_ziad.id,
                        responded_by_user_id=player_ziad.id, status="not_attending"))

    # Upcoming match
    db.session.add(RSVP(event_id=ev_match1.id, player_user_id=player_omar.id,
                        responded_by_user_id=player_omar.id, status="attending"))
    db.session.add(RSVP(event_id=ev_match1.id, player_user_id=player_sara.id,
                        responded_by_user_id=player_sara.id, status="maybe"))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # ATTENDANCE (past events)
    # ══════════════════════════════════════════════════════════════
    db.session.add(AttendanceRecord(
        event_id=ev_past1.id, player_user_id=player_omar.id,
        marked_by_user_id=coach_ali.id, status="present",
    ))
    db.session.add(AttendanceRecord(
        event_id=ev_past1.id, player_user_id=player_sara.id,
        marked_by_user_id=coach_ali.id, status="present",
    ))
    db.session.add(AttendanceRecord(
        event_id=ev_past1.id, player_user_id=player_ziad.id,
        marked_by_user_id=coach_ali.id, status="absent",
        absence_reason="Family trip",
    ))
    db.session.add(AttendanceRecord(
        event_id=ev_past2.id, player_user_id=player_omar.id,
        marked_by_user_id=coach_ali.id, status="present",
    ))
    db.session.add(AttendanceRecord(
        event_id=ev_past2.id, player_user_id=player_sara.id,
        marked_by_user_id=coach_ali.id, status="absent",
        absence_reason="Sick",
    ))
    db.session.add(AttendanceRecord(
        event_id=ev_past2.id, player_user_id=player_ziad.id,
        marked_by_user_id=coach_ali.id, status="present",
    ))
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # ANNOUNCEMENTS
    # ══════════════════════════════════════════════════════════════
    ann1 = Announcement(
        team_id=team_thunder.id, coach_user_id=coach_ali.id,
        title="Welcome to Spring Season 2026!",
        message="Excited to kick off the new season with Thunder U16. "
                "First practice is tomorrow at 8am on Court A. Come warmed up!",
        priority="high",
    )
    ann2 = Announcement(
        team_id=team_thunder.id, coach_user_id=coach_ali.id,
        title="League Match This Thursday — Important",
        message="Reminder: league match vs Eagles on Thursday at 2pm, Court B. "
                "Please RSVP in the app so I can finalize the lineup. "
                "Jerseys are mandatory — no jersey, no play.",
        priority="high",
    )
    ann3 = Announcement(
        team_id=team_thunder.id, coach_user_id=coach_ali.id,
        title="Court Change for Friday Practice",
        message="Friday's practice has moved from Court A to Court C due to maintenance. "
                "All other details remain the same.",
        priority="normal",
    )
    ann4 = Announcement(
        team_id=team_lightning.id, coach_user_id=coach_haydar.id,
        title="Tryouts Next Week — Spread the Word",
        message="Open tryouts for Lightning U14 are next week. "
                "Encourage any interested players to register through the app.",
        priority="normal",
    )
    db.session.add_all([ann1, ann2, ann3, ann4])
    db.session.flush()

    # ══════════════════════════════════════════════════════════════
    # NOTIFICATIONS
    # ══════════════════════════════════════════════════════════════

    # Player notifications
    db.session.add(Notification(
        user_id=player_omar.id, type="announcement", title="New Announcement from Coach Ali",
        message="Welcome to Spring Season 2026! First practice is tomorrow at 8am.", is_read=False,
    ))
    db.session.add(Notification(
        user_id=player_omar.id, type="schedule_change", title="Schedule Change",
        message="Event 'Friday Practice' has been updated — court changed to Court C.", is_read=False,
    ))
    db.session.add(Notification(
        user_id=player_sara.id, type="announcement", title="New Announcement from Coach Ali",
        message="League Match This Thursday — jerseys are mandatory.", is_read=False,
    ))
    db.session.add(Notification(
        user_id=player_ziad.id, type="announcement", title="New Announcement from Coach Ali",
        message="Welcome to Spring Season 2026!", is_read=True,
    ))

    # Parent notifications
    db.session.add(Notification(
        user_id=parent_ahmad.id, type="registration", title="Registration Approved",
        message="Omar Al-Rashid's registration for Thunder U16 has been approved.", is_read=False,
    ))
    db.session.add(Notification(
        user_id=parent_ahmad.id, type="invoice", title="Invoice Paid",
        message="Invoice #1 for Omar Al-Rashid — $180.00 has been marked as paid.", is_read=True,
    ))
    db.session.add(Notification(
        user_id=parent_fatima.id, type="invoice", title="Installment Due Soon",
        message="Second installment of $90.00 for Sara Khalil is due in 7 days.", is_read=False,
    ))
    db.session.add(Notification(
        user_id=parent_nour.id, type="invoice", title="Invoice Overdue",
        message="Invoice for Karim Mansour ($150.00) is overdue. Please pay as soon as possible.", is_read=False,
    ))

    # ══════════════════════════════════════════════════════════════
    # COMMUNITY HUB
    # ══════════════════════════════════════════════════════════════

    # Pinned post from admin
    post_pinned = CommunityPost(
        team_id=team_thunder.id, author_user_id=admin.id,
        title="📌 Season Rules & Code of Conduct",
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
        post_id=post_pinned.id, author_user_id=coach_ali.id,
        body="Fully agreed! I'll be posting training tips here regularly. Stay tuned.",
    ))

    # Training tip post by coach
    post_tip = CommunityPost(
        team_id=team_thunder.id, author_user_id=coach_ali.id,
        title="Serving Tip: Use Your Whole Body",
        body="A lot of players only use their arm when serving. "
             "Remember — power comes from your legs and core. "
             "Plant your feet, rotate your hips, and follow through. "
             "Try this at the next practice and let me know how it feels!",
        category="tip", is_pinned=False,
    )
    db.session.add(post_tip)
    db.session.flush()
    db.session.add(CommunityReply(
        post_id=post_tip.id, author_user_id=player_omar.id,
        body="This helped a lot in practice today, coach! My float serve finally has some power.",
    ))
    db.session.add(CommunityReply(
        post_id=post_tip.id, author_user_id=player_sara.id,
        body="Been working on this for a week. Big improvement. Thanks Coach Ali!",
    ))
    db.session.add(CommunityReply(
        post_id=post_tip.id, author_user_id=coach_ali.id,
        body="Great to hear! Keep it up. We'll drill this more on Tuesday.",
    ))

    # Question post by player
    post_question = CommunityPost(
        team_id=team_thunder.id, author_user_id=player_ziad.id,
        title="Best exercises to improve vertical jump?",
        body="Coach mentioned we need better vertical for blocking. "
             "Anyone have recommendations for off-court exercises I can do at home?",
        category="question", is_pinned=False,
    )
    db.session.add(post_question)
    db.session.flush()
    db.session.add(CommunityReply(
        post_id=post_question.id, author_user_id=coach_ali.id,
        body="Great question Ziad! Box jumps, jump squats, and calf raises are your best friends. "
             "3 sets of 10 reps, 3x a week. Give it 4 weeks and you'll notice the difference.",
    ))
    db.session.add(CommunityReply(
        post_id=post_question.id, author_user_id=player_omar.id,
        body="I also found jump rope really helps — 10 minutes daily makes a big difference.",
    ))
    db.session.flush()

    # Poll post — Player of the Week
    post_poll = CommunityPost(
        team_id=team_thunder.id, author_user_id=coach_ali.id,
        title="🏆 Player of the Week — Vote Now!",
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
    # Pre-seed some votes so the poll looks active
    db.session.add(CommunityPollVote(poll_id=poll.id, option_id=opt_omar.id, user_id=coach_ali.id))
    db.session.add(CommunityPollVote(poll_id=poll.id, option_id=opt_omar.id, user_id=player_ziad.id))
    db.session.add(CommunityPollVote(poll_id=poll.id, option_id=opt_sara.id,  user_id=player_lena.id))
    db.session.flush()

    # Lightning team question post
    post_lightning = CommunityPost(
        team_id=team_lightning.id, author_user_id=coach_haydar.id,
        title="Tryout Preparation Tips",
        body="For everyone attending the open tryouts next week:\n"
             "• Get good sleep the night before.\n"
             "• Warm up for at least 15 minutes.\n"
             "• Focus on fundamentals — passing, setting, serving.\n"
             "• We're looking for attitude and effort, not perfection.\n\n"
             "See you there! — Coach Haydar",
        category="tip", is_pinned=True,
    )
    db.session.add(post_lightning)
    db.session.flush()
    db.session.add(CommunityReply(
        post_id=post_lightning.id, author_user_id=player_karim.id,
        body="Thanks for the tips Coach! Really helpful. We'll be there early.",
    ))
    db.session.flush()

    db.session.commit()
    print("Demo database seeded successfully.")
    print()
    print("  All accounts use password: Password1!")
    print()
    print("  ADMIN   -> admin@rallyriot.com")
    print("  COACH   -> ali@rallyriot.com      (Thunder U16 + Storm)")
    print("  COACH   -> haydar@rallyriot.com   (Lightning U14)")
    print("  PARENT  -> ahmad@rallyriot.com    (children: Omar, Ziad)")
    print("  PARENT  -> fatima@rallyriot.com   (child: Sara)")
    print("  PARENT  -> nour@rallyriot.com     (child: Karim - overdue invoice)")
    print("  PLAYER  -> omar@rallyriot.com")
    print("  PLAYER  -> sara@rallyriot.com")
    print("  PLAYER  -> ziad@rallyriot.com")
    print("  PLAYER  -> lena@rallyriot.com     (no RSVPs yet - good for live demo)")
    print("  PLAYER  -> karim@rallyriot.com")


if __name__ == "__main__":
    from app import create_app
    app = create_app()
    with app.app_context():
        db.create_all()
        seed()
