"""Notification routes."""
from flask import Blueprint, g

import api_response
from auth import authenticate, authorize
from services import NotificationService, ReminderService

notification_bp = Blueprint("notifications", __name__)


@notification_bp.route("/", methods=["GET"])
@authenticate
def list_notifications():
    notifs = NotificationService.get_user_notifications(g.user["id"])
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
    count = ReminderService.send_upcoming_reminders(hours_ahead=24)
    return api_response.success({"events_notified": count}, f"Reminders sent for {count} upcoming event(s).")
