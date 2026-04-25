"""Business services: notifications, overlap checking, invoice generation."""
from datetime import datetime, timedelta, timezone

from extensions import db
from models import Notification, Event, Invoice, TeamPlayer, ParentChildLink, Discount, InstallmentPlan, InstallmentPayment


class NotificationService:
    """Create in-app notifications for users."""

    @staticmethod
    def notify(user_id, notif_type, message, *, title=None, metadata_json=None):
        n = Notification(
            user_id=user_id,
            type=notif_type,
            title=title or notif_type.replace("_", " ").title(),
            message=message,
            metadata_json=metadata_json,
        )
        db.session.add(n)
        db.session.flush()
        return n

    @staticmethod
    def notify_many(user_ids, notif_type, message, *, title=None, metadata_json=None):
        notes = []
        for uid in user_ids:
            notes.append(NotificationService.notify(
                uid, notif_type, message, title=title, metadata_json=metadata_json
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
        """Return a conflict description string or None if no conflict."""

        base = Event.query.filter(Event.start_time < end_time, Event.end_time > start_time)
        if exclude_event_id:
            base = base.filter(Event.id != exclude_event_id)

        # 1. Court conflict
        court_conflict = base.filter(Event.court == court).first()
        if court_conflict:
            return f"Court '{court}' is already booked during that time (event #{court_conflict.id})."

        # 2. Team conflict
        team_conflict = base.filter(Event.team_id == team_id).first()
        if team_conflict:
            return f"Team already has an event during that time (event #{team_conflict.id})."

        # 3. Coach conflict
        coach_conflict = base.filter(Event.created_by_user_id == coach_user_id).first()
        if coach_conflict:
            return f"Coach already has an event during that time (event #{coach_conflict.id})."

        return None


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
