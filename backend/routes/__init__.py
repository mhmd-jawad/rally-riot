"""Blueprint registration helper – imported by app.py."""
from routes.auth_routes import auth_bp
from routes.user_routes import user_bp
from routes.team_routes import team_bp
from routes.parent_child_routes import parent_child_bp
from routes.event_routes import event_bp
from routes.registration_routes import registration_bp
from routes.invoice_routes import invoice_bp
from routes.rsvp_attendance_routes import rsvp_bp, attendance_bp
from routes.announcement_routes import announcement_bp
from routes.notification_routes import notification_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(user_bp, url_prefix="/api/users")
    app.register_blueprint(team_bp, url_prefix="/api/teams")
    app.register_blueprint(parent_child_bp, url_prefix="/api/parent-child")
    app.register_blueprint(event_bp, url_prefix="/api/events")
    app.register_blueprint(registration_bp, url_prefix="/api/registrations")
    app.register_blueprint(invoice_bp, url_prefix="/api/invoices")
    app.register_blueprint(rsvp_bp, url_prefix="/api/rsvps")
    app.register_blueprint(attendance_bp, url_prefix="/api/attendance")
    app.register_blueprint(announcement_bp, url_prefix="/api/announcements")
    app.register_blueprint(notification_bp, url_prefix="/api/notifications")
