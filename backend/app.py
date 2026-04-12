"""Flask application factory."""
import os
from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from extensions import db
from routes import register_blueprints


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.url_map.strict_slashes = False

    # ── Extensions ──────────────────────────────────────────────
    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # ── Create tables, upload dir & auto-seed ───────────────────
    with app.app_context():
        import models  # noqa: F401 – ensures all models are registered
        db.create_all()
        os.makedirs(app.config.get("UPLOAD_DIR", "./uploads"), exist_ok=True)
        from seed import seed
        seed()

    # ── Blueprints ──────────────────────────────────────────────
    register_blueprints(app)

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
