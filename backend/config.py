import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"
    PORT = int(os.getenv("PORT", 5000))

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "rallyriot-super-secret-dev-key-2025")
    JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES", 86400))  # seconds

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_STORAGE = os.getenv("DB_STORAGE", "./data/rallyriot.sqlite")
    DB_PATH = os.path.join(BASE_DIR, DB_STORAGE)
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.normpath(DB_PATH)}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_DIR = os.path.join(BASE_DIR, os.getenv("UPLOAD_DIR", "../uploads"))
    MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 5 * 1024 * 1024))
    ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"]
    MAX_CONTENT_LENGTH = MAX_FILE_SIZE

    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Email / SMTP (optional — notifications degrade gracefully if not set)
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "noreply@rallyriot.com")
