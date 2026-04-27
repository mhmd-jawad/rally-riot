"""Flask application factory."""
import os
import logging
import logging.config
import logging.handlers
from flask import Flask, jsonify, request, g
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import text

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


def run_startup_migrations():
    """Apply small SQLite migrations that db.create_all() cannot handle."""
    changed = False

    def table_columns(table_name):
        return {
            row[1]
            for row in db.session.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        }

    if "wallet_balance" not in table_columns("users"):
        db.session.execute(text("ALTER TABLE users ADD COLUMN wallet_balance FLOAT NOT NULL DEFAULT 0.0"))
        changed = True

    if "priority_level" not in table_columns("teams"):
        db.session.execute(text("ALTER TABLE teams ADD COLUMN priority_level INTEGER NOT NULL DEFAULT 1"))
        changed = True

    if "recurring_rule_id" not in table_columns("events"):
        db.session.execute(text("ALTER TABLE events ADD COLUMN recurring_rule_id INTEGER"))
        changed = True

    if "absence_reason" not in table_columns("attendance_records"):
        db.session.execute(text("ALTER TABLE attendance_records ADD COLUMN absence_reason TEXT"))
        changed = True

    if "absence_reason" not in table_columns("rsvps"):
        db.session.execute(text("ALTER TABLE rsvps ADD COLUMN absence_reason TEXT"))
        changed = True

    if "target_user_id" not in table_columns("discounts"):
        db.session.execute(text("ALTER TABLE discounts ADD COLUMN target_user_id INTEGER"))
        changed = True

    # blocked_dates table is created by db.create_all() on first run — no ALTER needed

    # Make community_posts.team_id nullable (allow global posts with no team)
    # SQLite: check if the column is defined NOT NULL and rebuild the table if so
    community_cols = db.session.execute(text("PRAGMA table_info(community_posts)")).fetchall()
    team_id_col = next((c for c in community_cols if c[1] == "team_id"), None)
    if team_id_col and team_id_col[3] == 1:  # notnull flag == 1 means NOT NULL
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS community_posts_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER REFERENCES teams(id),
                author_user_id INTEGER NOT NULL REFERENCES users(id),
                title VARCHAR NOT NULL,
                body TEXT NOT NULL,
                category VARCHAR DEFAULT 'general',
                is_pinned BOOLEAN DEFAULT 0,
                created_at DATETIME,
                updated_at DATETIME
            )
        """))
        db.session.execute(text("INSERT INTO community_posts_new SELECT * FROM community_posts"))
        db.session.execute(text("DROP TABLE community_posts"))
        db.session.execute(text("ALTER TABLE community_posts_new RENAME TO community_posts"))
        changed = True

    if changed:
        db.session.commit()


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
        run_startup_migrations()
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
        logger.info("%s %s -> %d", request.method, request.path, response.status_code)
        record_request(response.status_code)
        return response

    # ── Background scheduler for automated reminders ─────────────
    is_testing = app.config.get("TESTING", False)
    if not is_testing and (not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"):
        def run_event_reminders():
            with app.app_context():
                from services import ReminderService
                # Automated event reminders: hourly, non-forced (deduped).
                ReminderService.send_upcoming_reminders(hours_ahead=72)

        def run_payment_reminders():
            with app.app_context():
                from services import ReminderService
                # Automated payment reminders: daily, deduped by invoice.
                ReminderService.send_payment_reminders()

        scheduler = BackgroundScheduler()
        scheduler.add_job(run_event_reminders, "interval", hours=1, id="event_reminders")
        scheduler.add_job(run_payment_reminders, "interval", hours=24, id="payment_reminders")
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
