"""Notification routes."""
import logging
from flask import Blueprint, g, request

import api_response
from auth import authenticate, authorize
from services import NotificationService, ReminderService, paginate
from models import Notification

notification_bp = Blueprint("notifications", __name__)
logger = logging.getLogger(__name__)


@notification_bp.route("/", methods=["GET"])
@authenticate
def list_notifications():
    page = request.args.get("page", type=int)
    per_page = request.args.get("per_page", 20, type=int)
    unread_only = request.args.get("unread", "false").lower() == "true"

    query = Notification.query.filter_by(user_id=g.user["id"])
    if unread_only:
        query = query.filter_by(is_read=False)
    query = query.order_by(Notification.created_at.desc())

    if page:
        notifs, meta = paginate(query, page, per_page)
        return api_response.success({
            "notifications": [n.to_dict() for n in notifs],
            "pagination": meta,
        })

    notifs = query.all()
    return api_response.success([n.to_dict() for n in notifs])


@notification_bp.route("/<int:notification_id>/read", methods=["PATCH"])
@authenticate
def mark_read(notification_id):
    result = NotificationService.mark_read(notification_id, g.user["id"])
    if not result:
        return api_response.not_found("Notification not found.")
    return api_response.success(result.to_dict(), "Notification marked as read.")


@notification_bp.route("/read-all", methods=["PATCH"])
@authenticate
def mark_all_read():
    count = NotificationService.mark_all_read(g.user["id"])
    return api_response.success({"updated": count}, f"{count} notifications marked as read.")


@notification_bp.route("/send-reminders", methods=["POST"])
@authenticate
@authorize("admin")
def send_reminders():
    body = request.get_json(silent=True) or {}
    raw_hours = body.get("hours_ahead", 72)
    force_send = bool(body.get("force_send", False))
    try:
        hours_ahead = int(raw_hours)
    except (TypeError, ValueError):
        return api_response.bad_request("hours_ahead must be an integer.")
    if hours_ahead < 1 or hours_ahead > 336:
        return api_response.bad_request("hours_ahead must be between 1 and 336.")

    try:
        stats = ReminderService.send_upcoming_reminders(
            hours_ahead=hours_ahead,
            return_details=True,
            force_send=force_send,
        )
    except Exception as exc:
        logger.exception("Failed to send event reminders: %s", exc)
        return api_response.server_error("Failed to send reminders.")

    msg = (
        f"New reminders sent for {stats['newly_sent']} event(s). "
        f"Upcoming in window: {stats['upcoming_events']}; "
        f"already reminded: {stats['already_reminded']}; "
        f"no recipients: {stats['no_recipients']}; failed: {stats['failed']}."
    )
    return api_response.success({"events_notified": stats["newly_sent"], "stats": stats}, msg)


@notification_bp.route("/send-payment-reminders", methods=["POST"])
@authenticate
@authorize("admin")
def send_payment_reminders():
    try:
        count = ReminderService.send_payment_reminders()
    except Exception as exc:
        logger.exception("Failed to send payment reminders: %s", exc)
        return api_response.server_error("Failed to send payment reminders.")

    return api_response.success({"invoices_notified": count}, f"Payment reminders sent for {count} unpaid invoice(s).")
