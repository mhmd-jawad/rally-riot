"""Business services: notifications, overlap checking, invoice generation."""
from datetime import datetime, timedelta

from extensions import db
from models import Notification, Event, Invoice


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


class InvoiceService:
    """Generate invoices from registrations."""

    @staticmethod
    def generate_from_registration(registration, form):
        """Create an invoice for a registration based on the form fee."""
        due_date = (datetime.utcnow() + timedelta(days=14)).date().isoformat()
        invoice = Invoice(
            registration_id=registration.id,
            parent_user_id=registration.parent_user_id,
            player_user_id=registration.player_user_id,
            amount=form.fee or 0.0,
            amount_paid=0.0,
            status="unpaid",
            due_date=due_date,
        )
        db.session.add(invoice)
        db.session.flush()
        return invoice
