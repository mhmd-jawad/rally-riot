"""Flask application factory."""
import os
import logging
import logging.config
import logging.handlers
from flask import Flask, jsonify, request, g
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

from config import Config
from extensions import db
from routes import register_blueprints


def configure_logging():
    log_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(log_dir, exist_ok=True)

    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                "datefmt": "%Y-%m-%dT%H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "default",
                "stream": "ext://sys.stdout",
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "formatter": "default",
                "filename": os.path.join(log_dir, "rallyriot.log"),
                "maxBytes": 10 * 1024 * 1024,  # 10 MB
                "backupCount": 5,
            },
        },
        "root": {"level": "INFO", "handlers": ["console", "file"]},
        "loggers": {
            "routes.ai_routes": {"level": "DEBUG"},
        },
    })


def create_app(config_class=Config):
    configure_logging()
    logger = logging.getLogger(__name__)

    app = Flask(__name__)
    app.config.from_object(config_class)
    app.url_map.strict_slashes = False

    # ── Extensions ──────────────────────────────────────────────
    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # ── Create tables, upload dir & auto-seed ───────────────────
    with app.app_context():
        import models  # noqa: F401 – ensures all models are registered
        import models_community  # noqa: F401 – community hub models
        # Enable WAL mode so reads never block each other under concurrent requests
        from sqlalchemy import event as sa_event, text
        from extensions import db as _db
        @sa_event.listens_for(_db.engine, "connect")
        def set_wal(dbapi_conn, _):
            dbapi_conn.execute("PRAGMA journal_mode=WAL")
            dbapi_conn.execute("PRAGMA synchronous=NORMAL")
            dbapi_conn.execute("PRAGMA busy_timeout=5000")
        db.create_all()
        os.makedirs(app.config.get("UPLOAD_DIR", "./uploads"), exist_ok=True)
        from seed import seed
        seed()

    # ── Blueprints ──────────────────────────────────────────────
    register_blueprints(app)

    # ── Request logging + monitoring counters ────────────────────
    from routes.monitoring_routes import record_request

    @app.before_request
    def log_request():
        logger.info("%s %s", request.method, request.path)

    @app.after_request
    def log_response(response):
        logger.info("%s %s → %d", request.method, request.path, response.status_code)
        record_request(response.status_code)
        return response

    # ── Background scheduler for event reminders ────────────────
    is_testing = app.config.get("TESTING", False)
    if not is_testing and (not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"):
        def run_reminders():
            with app.app_context():
                from services import ReminderService
                ReminderService.send_upcoming_reminders(hours_ahead=24)

        scheduler = BackgroundScheduler()
        scheduler.add_job(run_reminders, "interval", hours=1, id="event_reminders")
        scheduler.start()

    # ── Health check ────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "message": "RallyRiot API is running"})


    # ── Global error handlers ───────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "message": "Resource not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"success": False, "message": "Method not allowed."}), 405

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"success": False, "message": "Internal server error."}), 500

    return app


if __name__ == "__main__":
    application = create_app()
    port = int(os.getenv("PORT", 5000))
    application.run(host="0.0.0.0", port=port, debug=True)
