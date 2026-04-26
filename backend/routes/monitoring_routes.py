"""Monitoring and metrics routes."""
import time
import threading
import logging
from flask import Blueprint, jsonify

import api_response
from auth import authenticate, authorize
from extensions import db

logger = logging.getLogger(__name__)

monitoring_bp = Blueprint("monitoring", __name__)

# ── In-process stats (resets on restart) ──────────────────────────────────────

_lock = threading.Lock()
_stats = {
    "requests_total": 0,
    "requests_5xx": 0,
    "requests_4xx": 0,
    "start_time": time.time(),
}


def record_request(status_code: int):
    """Called by app.py after_request to increment counters."""
    with _lock:
        _stats["requests_total"] += 1
        if status_code >= 500:
            _stats["requests_5xx"] += 1
        elif status_code >= 400:
            _stats["requests_4xx"] += 1


# ── Public health check ────────────────────────────────────────────────────────

@monitoring_bp.route("/health", methods=["GET"])
def health():
    """Quick liveness + DB connectivity probe (no auth required)."""
    db_ok = True
    try:
        db.session.execute(db.text("SELECT 1"))
    except Exception:
        db_ok = False

    uptime = int(time.time() - _stats["start_time"])
    status = "ok" if db_ok else "degraded"
    return jsonify({
        "status": status,
        "database": "ok" if db_ok else "error",
        "uptime_seconds": uptime,
    }), 200 if db_ok else 503


# ── Admin metrics ──────────────────────────────────────────────────────────────

@monitoring_bp.route("/metrics", methods=["GET"])
@authenticate
@authorize("admin")
def metrics():
    """System-wide metrics — admin only."""
    from models import User, Team, Event, Registration, Invoice, Notification

    try:
        uptime = int(time.time() - _stats["start_time"])
        with _lock:
            req_total = _stats["requests_total"]
            req_5xx = _stats["requests_5xx"]
            req_4xx = _stats["requests_4xx"]

        counts = {
            "users": User.query.count(),
            "teams": Team.query.count(),
            "events": Event.query.count(),
            "registrations": Registration.query.count(),
            "unpaid_invoices": Invoice.query.filter_by(status="unpaid").count(),
            "unread_notifications": Notification.query.filter_by(is_read=False).count(),
        }

        return api_response.success({
            "uptime_seconds": uptime,
            "requests": {
                "total": req_total,
                "client_errors_4xx": req_4xx,
                "server_errors_5xx": req_5xx,
                "error_rate_pct": round(req_5xx / max(req_total, 1) * 100, 2),
            },
            "counts": counts,
        })
    except Exception as exc:
        logger.exception("Metrics error: %s", exc)
        return api_response.server_error("Failed to gather metrics.")
