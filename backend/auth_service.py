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


def normalize_clearance_level(value: Any) -> int:
    """Accepts DB integers and legacy strings such as 'Level 2' and normalizes to an integer."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text.startswith("level "):
            text = text[5:].strip()
        try:
            return int(float(text))
        except ValueError:
            pass
    return 0


def format_clearance_label(value: Any) -> str:
    """Human-readable security level for API/UI consumption."""
    return f"Level {normalize_clearance_level(value)}"


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
        "clearance_label": "Level 4",
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

    lookup_candidates = []
    for candidate in [clean_user, clean_user.lower(), clean_user.upper()]:
        if candidate and candidate not in lookup_candidates:
            lookup_candidates.append(candidate)

    alias_map = {
        "commander": ["hq-cdr-01"],
        "hq-cdr-01": ["hq-cdr-01"],
        "operator": ["operator1"],
        "op-sect-04": ["op-sect-04"],
        "operator1": ["operator1"],
        "admin": ["admin"],
    }
    for key, values in alias_map.items():
        if clean_user.lower() == key:
            for value in values:
                if value not in lookup_candidates:
                    lookup_candidates.append(value)

    # Support legacy role aliases used by older demo scripts while keeping the real seeded IDs authoritative.
    if clean_user.lower() in {"commander", "hq-cdr-01"}:
        lookup_candidates.extend(["hq-cdr-01", "commander"])
    if clean_user.lower() in {"operator", "op-sect-04"}:
        lookup_candidates.extend(["op-sect-04", "operator"])
    if clean_user.lower() == "admin":
        lookup_candidates.extend(["admin"])
    lookup_candidates = list(dict.fromkeys(lookup_candidates))

    # 1. SIH 2026 Primary Demo Credentials: admin / admin123
    # These are valid only when demo access is explicitly enabled; otherwise,
    # the database-backed accounts below must be used.
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
                level_value = normalize_clearance_level(row["clearance_level"])
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
                    "clearance_level": level_value,
                    "clearance_label": format_clearance_label(level_value),
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
        row = None
        for lookup_user in lookup_candidates:
            cursor.execute("""
                SELECT id, user_id, password_hash, salt, full_name, rank,
                       clearance_level, avatar_url, active_shift, assigned_sector
                FROM operators
                WHERE LOWER(user_id) = LOWER(?)
            """, (lookup_user,))
            row = cursor.fetchone()
            if row:
                break
        conn.close()

        if not row:
            return None

        computed_hash = hash_password(password, row["salt"])
        if not hmac.compare_digest(computed_hash, row["password_hash"]):
            return None

        level_value = normalize_clearance_level(row["clearance_level"])
        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "username": row["user_id"],
            "full_name": row["full_name"],
            "name": row["full_name"],
            "rank": row["rank"],
            "role": "ADMIN" if level_value >= 4 else "OPERATOR",
            "badge": "BSF-8841" if row["user_id"] == "operator1" else f"BSF-{row['id']:04d}",
            "badge_id": "BSF-8841" if row["user_id"] == "operator1" else f"BSF-{row['id']:04d}",
            "clearance_level": level_value,
            "clearance_label": format_clearance_label(level_value),
            "permissions": ["*"] if level_value >= 4 else ["SURVEILLANCE", "ALERTS"],
            "avatar_url": row["avatar_url"],
            "active_shift": row["active_shift"],
            "assigned_sector": row["assigned_sector"]
        }
    except Exception:
        return None


def create_session_token(operator: Dict[str, Any], remember: bool = False) -> str:
    """Creates a base64-hex HMAC-SHA256 signed session token."""
    duration = REMEMBER_SESSION_DURATION if remember else DEFAULT_SESSION_DURATION
    clearance_value = normalize_clearance_level(operator.get("clearance_level", 0))
    payload = {
        "id": operator.get("id", 0),
        "user_id": operator["user_id"],
        "username": operator.get("username", operator["user_id"]),
        "full_name": operator["full_name"],
        "name": operator.get("name", operator["full_name"]),
        "rank": operator["rank"],
        "role": operator.get("role", "ADMIN"),
        "badge": operator.get("badge", operator.get("badge_id", "")),
        "badge_id": operator.get("badge_id", operator.get("badge", "")),
        "clearance_level": clearance_value,
        "clearance_label": format_clearance_label(clearance_value),
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
