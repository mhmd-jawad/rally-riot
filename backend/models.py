"""SQLAlchemy models – single source of truth for all table definitions."""
from datetime import datetime
from extensions import db


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    full_name = db.Column(db.String, nullable=False)
    email = db.Column(db.String, nullable=False, unique=True)
    password_hash = db.Column(db.String, nullable=False)
    role = db.Column(db.String, nullable=False)  # admin, coach, player, parent
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    child_links = db.relationship("ParentChildLink", foreign_keys="ParentChildLink.parent_user_id", backref="parent", lazy="dynamic")
    parent_links = db.relationship("ParentChildLink", foreign_keys="ParentChildLink.child_user_id", backref="child", lazy="dynamic")
    notifications = db.relationship("Notification", backref="user", lazy="dynamic")

    def to_dict(self, include_hash=False):
        d = {
            "id": self.id,
            "full_name": self.full_name,
            "email": self.email,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_hash:
            d["password_hash"] = self.password_hash
        return d

    def to_public(self):
        return {"id": self.id, "full_name": self.full_name, "email": self.email}


class ParentChildLink(db.Model):
    __tablename__ = "parent_child_links"
    __table_args__ = (db.UniqueConstraint("parent_user_id", "child_user_id"),)
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    parent_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    child_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "parent_user_id": self.parent_user_id,
            "child_user_id": self.child_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Team(db.Model):
    __tablename__ = "teams"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String, nullable=False, unique=True)
    age_group = db.Column(db.String, nullable=True)
    skill_level = db.Column(db.String, nullable=True)
    priority_level = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    coaches = db.relationship("User", secondary="team_coaches", backref="coached_teams", lazy="dynamic")
    players = db.relationship("User", secondary="team_players", backref="player_teams", lazy="dynamic")
    events = db.relationship("Event", backref="team", lazy="dynamic")
    announcements = db.relationship("Announcement", backref="team", lazy="dynamic")

    def to_dict(self, include_members=False):
        d = {
            "id": self.id,
            "name": self.name,
            "age_group": self.age_group,
            "skill_level": self.skill_level,
            "priority_level": self.priority_level,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_members:
            d["coaches"] = [u.to_public() for u in self.coaches.all()]
            d["players"] = [u.to_public() for u in self.players.all()]
        return d


class TeamCoach(db.Model):
    __tablename__ = "team_coaches"
    __table_args__ = (db.UniqueConstraint("team_id", "coach_user_id"),)
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False)
    coach_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)


class TeamPlayer(db.Model):
    __tablename__ = "team_players"
    __table_args__ = (db.UniqueConstraint("team_id", "player_user_id"),)
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False)
    player_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)


class RecurringEventRule(db.Model):
    __tablename__ = "recurring_event_rules"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    event_type = db.Column(db.String, nullable=False)
    title = db.Column(db.String, nullable=False)
    description = db.Column(db.Text, nullable=True)
    court = db.Column(db.String, nullable=False)
    # days_of_week: comma-separated ints 0=Mon … 6=Sun e.g. "0,2,4"
    days_of_week = db.Column(db.String, nullable=False)
    start_date = db.Column(db.String, nullable=False)   # ISO date YYYY-MM-DD
    end_date = db.Column(db.String, nullable=False)     # ISO date YYYY-MM-DD
    start_hour = db.Column(db.Integer, nullable=False)  # local hour of day
    start_minute = db.Column(db.Integer, nullable=False, default=0)
    duration_minutes = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    events = db.relationship("Event", backref="recurring_rule", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "team_id": self.team_id,
            "created_by_user_id": self.created_by_user_id,
            "event_type": self.event_type,
            "title": self.title,
            "description": self.description,
            "court": self.court,
            "days_of_week": self.days_of_week,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "start_hour": self.start_hour,
            "start_minute": self.start_minute,
            "duration_minutes": self.duration_minutes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Event(db.Model):
    __tablename__ = "events"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    recurring_rule_id = db.Column(db.Integer, db.ForeignKey("recurring_event_rules.id"), nullable=True)
    event_type = db.Column(db.String, nullable=False)  # practice, match, tryout, tournament
    title = db.Column(db.String, nullable=False)
    description = db.Column(db.Text, nullable=True)
    court = db.Column(db.String, nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = db.relationship("User", foreign_keys=[created_by_user_id])

    def to_dict(self, include_relations=False):
        d = {
            "id": self.id,
            "team_id": self.team_id,
            "created_by_user_id": self.created_by_user_id,
            "recurring_rule_id": self.recurring_rule_id,
            "event_type": self.event_type,
            "title": self.title,
            "description": self.description,
            "court": self.court,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_relations:
            if self.team:
                d["team"] = {"id": self.team.id, "name": self.team.name}
            if self.created_by:
                d["createdBy"] = {"id": self.created_by.id, "full_name": self.created_by.full_name}
        return d


class RegistrationForm(db.Model):
    __tablename__ = "registration_forms"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String, nullable=False)
    description = db.Column(db.Text, nullable=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=True)
    season = db.Column(db.String, nullable=True)
    fee = db.Column(db.Float, default=0.0)
    status = db.Column(db.String, default="open")  # open, closed
    requires_waiver = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    team = db.relationship("Team", foreign_keys=[team_id])
    created_by = db.relationship("User", foreign_keys=[created_by_user_id])
    registrations = db.relationship("Registration", backref="form", lazy="dynamic")

    def to_dict(self):
        d = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "team_id": self.team_id,
            "season": self.season,
            "fee": self.fee,
            "status": self.status,
            "requires_waiver": self.requires_waiver,
            "is_active": self.is_active,
            "created_by_user_id": self.created_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        return d


class Registration(db.Model):
    __tablename__ = "registrations"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    form_id = db.Column(db.Integer, db.ForeignKey("registration_forms.id"), nullable=False)
    player_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    parent_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String, default="pending")  # pending, approved, rejected

    player = db.relationship("User", foreign_keys=[player_user_id])
    parent = db.relationship("User", foreign_keys=[parent_user_id])
    waiver = db.relationship("WaiverFile", uselist=False, backref="registration")
    invoice = db.relationship("Invoice", uselist=False, backref="registration")

    def to_dict(self, include_relations=False):
        data = {
            "id": self.id,
            "form_id": self.form_id,
            "player_user_id": self.player_user_id,
            "parent_user_id": self.parent_user_id,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "status": self.status,
        }
        if include_relations:
            if self.form:
                data["form"] = {
                    "id": self.form.id,
                    "title": self.form.title,
                    "requires_waiver": self.form.requires_waiver,
                }
            if self.player:
                data["player"] = self.player.to_public()
        return data


class WaiverFile(db.Model):
    __tablename__ = "waiver_files"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    registration_id = db.Column(db.Integer, db.ForeignKey("registrations.id"), nullable=False)
    file_path = db.Column(db.String, nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "registration_id": self.registration_id,
            "file_path": self.file_path,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None,
        }


class Invoice(db.Model):
    __tablename__ = "invoices"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    registration_id = db.Column(db.Integer, db.ForeignKey("registrations.id"), nullable=False)
    parent_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    player_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    amount = db.Column(db.Float, nullable=False, default=0.0)
    amount_paid = db.Column(db.Float, nullable=False, default=0.0)
    status = db.Column(db.String, default="unpaid")  # unpaid, paid
    due_date = db.Column(db.String, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = db.relationship("User", foreign_keys=[parent_user_id])
    player = db.relationship("User", foreign_keys=[player_user_id])

    def to_dict(self, include_relations=False):
        outstanding_balance = max(float(self.amount) - float(self.amount_paid), 0.0)
        plan = InstallmentPlan.query.filter_by(invoice_id=self.id).first()
        data = {
            "id": self.id,
            "registration_id": self.registration_id,
            "parent_user_id": self.parent_user_id,
            "player_user_id": self.player_user_id,
            "amount": self.amount,
            "amount_paid": self.amount_paid,
            "status": self.status,
            "due_date": self.due_date,
            "outstanding_balance": outstanding_balance,
            "has_installment_plan": plan is not None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_relations:
            if self.parent:
                data["parent"] = self.parent.to_public()
            if self.player:
                data["player"] = self.player.to_public()
        return data


class Discount(db.Model):
    __tablename__ = "discounts"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    form_id = db.Column(db.Integer, db.ForeignKey("registration_forms.id"), nullable=False)
    label = db.Column(db.String, nullable=False)
    discount_type = db.Column(db.String, nullable=False)  # percentage, fixed
    value = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    form = db.relationship("RegistrationForm", foreign_keys=[form_id])

    def to_dict(self):
        return {
            "id": self.id,
            "form_id": self.form_id,
            "label": self.label,
            "discount_type": self.discount_type,
            "value": self.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class InstallmentPlan(db.Model):
    __tablename__ = "installment_plans"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey("invoices.id"), nullable=False)
    num_installments = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    invoice = db.relationship("Invoice", foreign_keys=[invoice_id])
    payments = db.relationship("InstallmentPayment", backref="plan", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "invoice_id": self.invoice_id,
            "num_installments": self.num_installments,
            "payments": [p.to_dict() for p in self.payments.order_by(InstallmentPayment.due_date.asc()).all()],
        }


class InstallmentPayment(db.Model):
    __tablename__ = "installment_payments"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    plan_id = db.Column(db.Integer, db.ForeignKey("installment_plans.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    due_date = db.Column(db.String, nullable=False)
    status = db.Column(db.String, default="unpaid")  # unpaid, paid
    paid_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "plan_id": self.plan_id,
            "amount": self.amount,
            "due_date": self.due_date,
            "status": self.status,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
        }


class RSVP(db.Model):
    __tablename__ = "rsvps"
    __table_args__ = (db.UniqueConstraint("event_id", "player_user_id"),)
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=False)
    player_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    responded_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    status = db.Column(db.String, nullable=False)  # attending, not_attending, maybe
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    event = db.relationship("Event", foreign_keys=[event_id])
    player = db.relationship("User", foreign_keys=[player_user_id])
    responded_by = db.relationship("User", foreign_keys=[responded_by_user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "event_id": self.event_id,
            "player_user_id": self.player_user_id,
            "responded_by_user_id": self.responded_by_user_id,
            "status": self.status,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AttendanceRecord(db.Model):
    __tablename__ = "attendance_records"
    __table_args__ = (db.UniqueConstraint("event_id", "player_user_id"),)
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=False)
    player_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    marked_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    status = db.Column(db.String, nullable=False)  # present, absent
    absence_reason = db.Column(db.Text, nullable=True)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)

    event = db.relationship("Event", foreign_keys=[event_id])
    player = db.relationship("User", foreign_keys=[player_user_id])
    marked_by = db.relationship("User", foreign_keys=[marked_by_user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "event_id": self.event_id,
            "player_user_id": self.player_user_id,
            "marked_by_user_id": self.marked_by_user_id,
            "status": self.status,
            "absence_reason": self.absence_reason,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }


class Announcement(db.Model):
    __tablename__ = "announcements"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False)
    coach_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String, nullable=False)
    message = db.Column(db.Text, nullable=False)
    priority = db.Column(db.String, default="normal")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    coach = db.relationship("User", foreign_keys=[coach_user_id])

    def to_dict(self):
        d = {
            "id": self.id,
            "team_id": self.team_id,
            "coach_user_id": self.coach_user_id,
            "title": self.title,
            "message": self.message,
            "priority": self.priority,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if self.team:
            d["team"] = {"id": self.team.id, "name": self.team.name}
        return d


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    type = db.Column(db.String, nullable=False)
    title = db.Column(db.String, nullable=True)
    message = db.Column(db.Text, nullable=False)
    metadata_json = db.Column(db.Text, nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.type,
            "title": self.title,
            "message": self.message,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
