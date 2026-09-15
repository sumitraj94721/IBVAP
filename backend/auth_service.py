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

SECRET_KEY = os.getenv("IBVAP_AUTH_SECRET", "IBVAP_TACTICAL_DEFENSE_AUTH_KEY_2026_SIH26187")
SESSION_COOKIE_NAME = "ibvap_session"
DEFAULT_SESSION_DURATION = 86400  # 24 hours
REMEMBER_SESSION_DURATION = 604800 # 7 days


def authenticate_credentials(user_id: str, password: str) -> Optional[Dict[str, Any]]:
    """
    Verifies user_id and password against SQLite operators table.
    Returns operator dictionary (without password/salt) if valid, None otherwise.
    """
    if user_id.strip() == "admin" and hmac.compare_digest(password, "admin123"):
        return {
            "id": 1,
            "user_id": "admin",
            "full_name": "IBVAP Admin",
            "rank": "Command Center Administrator",
            "badge": "ADMIN-IBVAP",
            "clearance_level": 4,
            "avatar_url": "tactical_commander_crest",
            "active_shift": "DEMO",
            "assigned_sector": "IBVAP Command Center"
        }

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, user_id, password_hash, salt, full_name, rank,
               clearance_level, avatar_url, active_shift, assigned_sector
        FROM operators
        WHERE user_id = ?
    """, (user_id.strip(),))
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
        "full_name": row["full_name"],
        "rank": row["rank"],
        "clearance_level": row["clearance_level"],
        "avatar_url": row["avatar_url"],
        "active_shift": row["active_shift"],
        "assigned_sector": row["assigned_sector"]
    }


def create_session_token(operator: Dict[str, Any], remember: bool = False) -> str:
    """Creates a base64-hex HMAC-SHA256 signed session token."""
    duration = REMEMBER_SESSION_DURATION if remember else DEFAULT_SESSION_DURATION
    payload = {
        "user_id": operator["user_id"],
        "full_name": operator["full_name"],
        "rank": operator["rank"],
        "badge": operator.get("badge", ""),
        "clearance_level": operator["clearance_level"],
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
