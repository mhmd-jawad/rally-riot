"""Business services: notifications, overlap checking, invoice generation."""
import logging
import smtplib
import os
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from extensions import db
from models import Notification, Event, Invoice, TeamPlayer, ParentChildLink, Discount, InstallmentPlan, InstallmentPayment, User

logger = logging.getLogger(__name__)


class EmailService:
    """Send email notifications via SMTP. Gracefully degrades if not configured."""

    @staticmethod
    def _smtp_config():
        return {
            "host": os.getenv("SMTP_HOST", ""),
            "port": int(os.getenv("SMTP_PORT", "587")),
            "user": os.getenv("SMTP_USER", ""),
            "password": os.getenv("SMTP_PASSWORD", ""),
            "from_addr": os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "noreply@rallyriot.com")),
        }

    @staticmethod
    def send(to_email: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
        """Send an email. Returns True on success, False if SMTP is not configured or fails."""
        cfg = EmailService._smtp_config()
        if not cfg["host"] or not cfg["user"]:
            logger.debug("SMTP not configured — skipping email to %s", to_email)
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = cfg["from_addr"]
        msg["To"] = to_email
        msg.attach(MIMEText(body_text, "plain"))
        if body_html:
            msg.attach(MIMEText(body_html, "html"))

        try:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.login(cfg["user"], cfg["password"])
                server.sendmail(cfg["from_addr"], [to_email], msg.as_string())
            logger.info("Email sent to %s: %s", to_email, subject)
            return True
        except Exception as exc:
            logger.warning("Failed to send email to %s: %s", to_email, exc)
            return False

    @staticmethod
    def notify_user(user_id: int, subject: str, body_text: str, body_html: str | None = None) -> bool:
        """Look up user email and send. Returns False silently if user not found or SMTP down."""
        user = User.query.get(user_id)
        if not user:
            return False
        return EmailService.send(user.email, subject, body_text, body_html)

    @staticmethod
    def notify_users(user_ids: list, subject: str, body_text: str, body_html: str | None = None):
        """Send the same email to multiple users."""
        for uid in user_ids:
            EmailService.notify_user(uid, subject, body_text, body_html)


class NotificationService:
    """Create in-app notifications for users, optionally sending email too."""

    @staticmethod
    def notify(user_id, notif_type, message, *, title=None, metadata_json=None, send_email=False):
        notif_title = title or notif_type.replace("_", " ").title()
        n = Notification(
            user_id=user_id,
            type=notif_type,
            title=notif_title,
            message=message,
            metadata_json=metadata_json,
        )
        db.session.add(n)
        db.session.flush()
        if send_email:
            EmailService.notify_user(user_id, f"RallyRiot: {notif_title}", message)
        return n

    @staticmethod
    def notify_many(user_ids, notif_type, message, *, title=None, metadata_json=None, send_email=False):
        notes = []
        for uid in user_ids:
            notes.append(NotificationService.notify(
                uid, notif_type, message, title=title,
                metadata_json=metadata_json, send_email=send_email,
            ))
        return notes

    @staticmethod
    def get_user_notifications(user_id, unread_only=False):
        q = Notification.query.filter_by(user_id=user_id)
        if unread_only:
            q = q.filter_by(is_read=False)
        return q.order_by(Notification.created_at.desc()).all()

    @staticmethod
    def mark_read(notification_id, user_id):
        n = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
        if n:
            n.is_read = True
            db.session.commit()
        return n

    @staticmethod
    def mark_all_read(user_id):
        count = Notification.query.filter_by(user_id=user_id, is_read=False).update({"is_read": True})
        db.session.commit()
        return count


class OverlapService:
    """Check scheduling conflicts for events."""

    @staticmethod
    def check_conflicts(court, team_id, coach_user_id, start_time, end_time, exclude_event_id=None):
        """Return a dict with conflict details or None if no conflict.

        Dict shape: {"type": "court"|"team"|"coach", "message": str, "conflicting_event_id": int}
        Callers that only need the message can call .get("message").
        """
        base = Event.query.filter(Event.start_time < end_time, Event.end_time > start_time)
        if exclude_event_id:
            base = base.filter(Event.id != exclude_event_id)

        court_conflict = base.filter(Event.court == court).first()
        if court_conflict:
            return {
                "type": "court",
                "message": (
                    f"Court '{court}' is already booked "
                    f"{court_conflict.start_time.strftime('%b %d %H:%M')}–"
                    f"{court_conflict.end_time.strftime('%H:%M')} "
                    f"by event '{court_conflict.title}' (#{court_conflict.id})."
                ),
                "conflicting_event_id": court_conflict.id,
            }

        team_conflict = base.filter(Event.team_id == team_id).first()
        if team_conflict:
            return {
                "type": "team",
                "message": (
                    f"This team already has '{team_conflict.title}' scheduled "
                    f"{team_conflict.start_time.strftime('%b %d %H:%M')}–"
                    f"{team_conflict.end_time.strftime('%H:%M')} (#{team_conflict.id})."
                ),
                "conflicting_event_id": team_conflict.id,
            }

        coach_conflict = base.filter(Event.created_by_user_id == coach_user_id).first()
        if coach_conflict:
            return {
                "type": "coach",
                "message": (
                    f"You already have '{coach_conflict.title}' scheduled "
                    f"{coach_conflict.start_time.strftime('%b %d %H:%M')}–"
                    f"{coach_conflict.end_time.strftime('%H:%M')} (#{coach_conflict.id})."
                ),
                "conflicting_event_id": coach_conflict.id,
            }

        return None


def paginate(query, page: int = 1, per_page: int = 20):
    """Return (items, meta) where meta contains pagination info.

    Only kicks in when page > 0. Pass page=None to skip pagination.
    per_page is clamped to [1, 100].
    """
    per_page = min(max(1, per_page), 100)
    page = max(1, page)
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return items, {
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


class ReminderService:
    """Send event reminder notifications to players and parents."""

    @staticmethod
    def send_upcoming_reminders(hours_ahead=24):
        """
        Find events starting within the next `hours_ahead` hours and notify
        all players on the team plus their linked parents. Skips events that
        already have a reminder notification sent within the last hour to avoid
        duplicates if the job runs frequently.
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        window_start = now
        window_end = now + timedelta(hours=hours_ahead)

        upcoming = Event.query.filter(
            Event.start_time >= window_start,
            Event.start_time <= window_end,
        ).all()

        notified_count = 0
        for event in upcoming:
            # Check if a reminder was already sent for this event recently
            already_sent = Notification.query.filter(
                Notification.type == "event_reminder",
                Notification.title.like(f"%{event.id}%"),
                Notification.created_at >= now - timedelta(hours=1),
            ).first()
            if already_sent:
                continue

            players = TeamPlayer.query.filter_by(team_id=event.team_id).all()
            player_ids = [p.player_user_id for p in players]

            if not player_ids:
                continue

            start_str = event.start_time.strftime("%b %d at %I:%M %p")
            message = f"Reminder: '{event.title}' is scheduled for {start_str} at {event.court}."
            title = f"[Event #{event.id}] Upcoming Event Reminder"

            NotificationService.notify_many(
                player_ids,
                "event_reminder",
                message,
                title=title,
                send_email=True,
            )

            # Also notify parents of those players
            parent_ids = set()
            for pid in player_ids:
                links = ParentChildLink.query.filter_by(child_user_id=pid).all()
                for link in links:
                    parent_ids.add(link.parent_user_id)

            if parent_ids:
                NotificationService.notify_many(
                    list(parent_ids),
                    "event_reminder",
                    message,
                    title=title,
                    send_email=True,
                )

            db.session.commit()
            notified_count += 1

        return notified_count

    @staticmethod
    def send_payment_reminders():
        """
        Notify parents (and players) who have unpaid or overdue invoices.
        Skips invoices that already received a payment reminder in the last 24 hours.
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        unpaid = Invoice.query.filter(Invoice.status != "paid").all()

        notified_count = 0
        for invoice in unpaid:
            already_sent = Notification.query.filter(
                Notification.type == "payment_reminder",
                Notification.title.like(f"%#{invoice.id}%"),
                Notification.created_at >= now - timedelta(hours=24),
            ).first()
            if already_sent:
                continue

            outstanding = invoice.amount - invoice.amount_paid
            overdue = invoice.due_date and datetime.strptime(invoice.due_date, "%Y-%m-%d").date() < now.date()
            prefix = "OVERDUE" if overdue else "Payment Reminder"
            due_str = f" (due {invoice.due_date})" if invoice.due_date else ""
            title = f"[Invoice #{invoice.id}] {prefix}"
            message = (
                f"Invoice #{invoice.id} has an outstanding balance of ${outstanding:.2f}{due_str}. "
                "Please log in to complete your payment."
            )

            recipient_ids = []
            if invoice.parent_user_id:
                recipient_ids.append(invoice.parent_user_id)
            if invoice.player_user_id and invoice.player_user_id not in recipient_ids:
                recipient_ids.append(invoice.player_user_id)

            if recipient_ids:
                NotificationService.notify_many(
                    recipient_ids,
                    "payment_reminder",
                    message,
                    title=title,
                    send_email=True,
                )
                db.session.commit()
                notified_count += 1

        return notified_count


class InvoiceService:
    """Generate invoices from registrations, applying discounts and installment plans."""

    @staticmethod
    def generate_from_registration(registration, form, num_installments=1):
        """Create an invoice for a registration, applying any form discounts and splitting into installments."""
        base_fee = float(form.fee or 0.0)

        # Apply all discounts defined on this form
        discounts = Discount.query.filter_by(form_id=form.id).all()
        total_discount = 0.0
        for d in discounts:
            if d.discount_type == "percentage":
                total_discount += base_fee * (d.value / 100.0)
            else:  # fixed
                total_discount += d.value
        final_amount = max(base_fee - total_discount, 0.0)

        due_date = (datetime.utcnow() + timedelta(days=14)).date().isoformat()
        invoice = Invoice(
            registration_id=registration.id,
            parent_user_id=registration.parent_user_id,
            player_user_id=registration.player_user_id,
            amount=round(final_amount, 2),
            amount_paid=0.0,
            status="unpaid",
            due_date=due_date,
        )
        db.session.add(invoice)
        db.session.flush()

        # Create installment plan if requested and fee > 0
        if num_installments > 1 and final_amount > 0:
            plan = InstallmentPlan(invoice_id=invoice.id, num_installments=num_installments)
            db.session.add(plan)
            db.session.flush()

            installment_amount = round(final_amount / num_installments, 2)
            # Adjust last installment for rounding
            for i in range(num_installments):
                due = (datetime.utcnow() + timedelta(days=14 + i * 30)).date().isoformat()
                amt = installment_amount if i < num_installments - 1 else round(final_amount - installment_amount * (num_installments - 1), 2)
                db.session.add(InstallmentPayment(plan_id=plan.id, amount=amt, due_date=due, status="unpaid"))

        db.session.flush()
        return invoice
