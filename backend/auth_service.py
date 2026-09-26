"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Authentication Service
Cryptographic HMAC-SHA256 session token management & credential verification.
"""

import os
import hmac
import hashlib
import time
import json
import secrets
from typing import Optional, Dict, Any

from backend.database import get_db_connection, hash_password

APP_ENV = os.getenv("IBVAP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"
DEMO_BYPASS_AUTH = os.getenv("DEMO_BYPASS_AUTH", "false").strip().lower() in {"1", "true", "yes", "on"}
DEMO_CREDENTIALS_ENABLED = os.getenv(
    "IBVAP_ENABLE_DEMO_CREDENTIALS", "false" if IS_PRODUCTION else "true"
).strip().lower() in {"1", "true", "yes", "on"}
configured_secret = os.getenv("IBVAP_AUTH_SECRET")
if IS_PRODUCTION and not configured_secret:
    raise RuntimeError("IBVAP_AUTH_SECRET must be set when IBVAP_ENV=production")
if IS_PRODUCTION and (DEMO_BYPASS_AUTH or DEMO_CREDENTIALS_ENABLED):
    raise RuntimeError("Demo authentication must be disabled when IBVAP_ENV=production")
SECRET_KEY = configured_secret or secrets.token_hex(32)
SECURE_SESSION_COOKIE = IS_PRODUCTION
SESSION_COOKIE_NAME = "ibvap_session"
DEFAULT_SESSION_DURATION = 86400  # 24 hours
REMEMBER_SESSION_DURATION = 604800 # 7 days
DEMO_DEFAULT_PASSWORDS = {
    "admin": "admin123",
    "hq-cdr-01": "Commander@2026",
    "op-sect-04": "Operator@2026",
    "operator1": "Border@2026",
}


def get_demo_officer(user_id: str = "") -> Dict[str, Any]:
    """Return the full-privilege identity used by the demo admin."""
    resolved_user_id = user_id.strip() or "admin"
    return {
        "id": 1,
        "user_id": resolved_user_id,
        "username": resolved_user_id,
        "full_name": "Insp. Vikram Singh",
        "name": "Insp. Vikram Singh",
        "rank": "Sector Commander",
        "role": "ADMIN",
        "badge": "BSF-8841",
        "badge_id": "BSF-8841",
        "clearance_level": 4,
        "permissions": ["*"],
        "avatar_url": "tactical_commander_crest",
        "active_shift": "06:00 - 18:00 (Alpha Day Watch)",
        "assigned_sector": "Sector Alpha - Post 04"
    }


def authenticate_credentials(user_id: str, password: str) -> Optional[Dict[str, Any]]:
    """
    Verifies user_id and password against SQLite operators table or SIH demo credentials.
    Returns operator dictionary (without password/salt) if valid, None otherwise.
    """
    clean_user = (user_id or "").strip()
    if not clean_user or not password:
        return None

    if DEMO_BYPASS_AUTH:
        return get_demo_officer(clean_user)

    if not DEMO_CREDENTIALS_ENABLED and DEMO_DEFAULT_PASSWORDS.get(clean_user.lower()) == password:
        return None

    # 1. SIH 2026 Primary Demo Credentials: admin / admin123
    if clean_user.lower() == "admin" and DEMO_CREDENTIALS_ENABLED:
        if password != "admin123":
            return None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, user_id, password_hash, salt, full_name, rank,
                       clearance_level, avatar_url, active_shift, assigned_sector
                FROM operators
                WHERE LOWER(user_id) = 'admin'
            """)
            row = cursor.fetchone()
            conn.close()
            if row:
                return {
                    "id": row["id"],
                    "user_id": row["user_id"],
                    "username": row["user_id"],
                    "full_name": row["full_name"],
                    "name": row["full_name"],
                    "rank": row["rank"],
                    "role": "ADMIN",
                    "badge": "BSF-8841",
                    "badge_id": "BSF-8841",
                    "clearance_level": row["clearance_level"],
                    "permissions": ["*"],
                    "avatar_url": row["avatar_url"],
                    "active_shift": row["active_shift"],
                    "assigned_sector": row["assigned_sector"]
                }
        except Exception:
            pass
        return get_demo_officer("admin")

    # 2. Database validation for other personnel (e.g. HQ-CDR-01, OP-SECT-04, operator1)
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, user_id, password_hash, salt, full_name, rank,
                   clearance_level, avatar_url, active_shift, assigned_sector
            FROM operators
            WHERE LOWER(user_id) = LOWER(?)
        """, (clean_user,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        computed_hash = hash_password(password, row["salt"])
        if not hmac.compare_digest(computed_hash, row["password_hash"]):
            return None

        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "username": row["user_id"],
            "full_name": row["full_name"],
            "name": row["full_name"],
            "rank": row["rank"],
            "role": "ADMIN" if row["clearance_level"] >= 4 else "OPERATOR",
            "badge": "BSF-8841" if row["user_id"] == "operator1" else f"BSF-{row['id']:04d}",
            "badge_id": "BSF-8841" if row["user_id"] == "operator1" else f"BSF-{row['id']:04d}",
            "clearance_level": row["clearance_level"],
            "permissions": ["*"] if row["clearance_level"] >= 4 else ["SURVEILLANCE", "ALERTS"],
            "avatar_url": row["avatar_url"],
            "active_shift": row["active_shift"],
            "assigned_sector": row["assigned_sector"]
        }
    except Exception:
        return None


def create_session_token(operator: Dict[str, Any], remember: bool = False) -> str:
    """Creates a base64-hex HMAC-SHA256 signed session token."""
    duration = REMEMBER_SESSION_DURATION if remember else DEFAULT_SESSION_DURATION
    payload = {
        "id": operator.get("id", 0),
        "user_id": operator["user_id"],
        "full_name": operator["full_name"],
        "rank": operator["rank"],
        "role": operator.get("role", "ADMIN"),
        "badge": operator.get("badge", ""),
        "clearance_level": operator["clearance_level"],
        "permissions": operator.get("permissions", ["*"]),
        "avatar_url": operator.get("avatar_url", ""),
        "assigned_sector": operator["assigned_sector"],
        "session_id": secrets.token_hex(8),
        "login_time": time.time(),
        "exp": time.time() + duration
    }
    raw_json = json.dumps(payload, separators=(',', ':'))
    payload_hex = raw_json.encode("utf-8").hex()
    signature = hmac.new(
        SECRET_KEY.encode("utf-8"),
        payload_hex.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return f"{payload_hex}.{signature}"


def verify_session_token(token: str) -> Optional[Dict[str, Any]]:
    """Verifies token signature, integrity, and expiration."""
    if not token or "." not in token:
        return None
    try:
        payload_hex, signature = token.split(".", 1)
        expected_sig = hmac.new(
            SECRET_KEY.encode("utf-8"),
            payload_hex.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None

        raw_json = bytes.fromhex(payload_hex).decode("utf-8")
        payload = json.loads(raw_json)

        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None
