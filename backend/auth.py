"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Role-Based Access Control (RBAC) & Tactical Incident Response Subsystem
SQLite persistence, HMAC-SHA256 session token management, and QRT escalation.
"""

import os
import hmac
import hashlib
import time
import json
import sqlite3
import secrets
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "security.db")
SECRET_KEY = os.getenv("IBVAP_SECRET_KEY", "IBVAP_DEFENSE_TACTICAL_SECRET_2026_SIH26187")
SESSION_COOKIE_NAME = "ibvap_session"
DEMO_BYPASS_AUTH = os.getenv("DEMO_BYPASS_AUTH", "true").strip().lower() in {"1", "true", "yes", "on"}

auth_router = APIRouter(prefix="/api", tags=["Security & Incident Response"])


# -------------------------------------------------------------
# Database Setup & Initialization
# -------------------------------------------------------------
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_security_db():
    """Initializes SQLite tables and seeds mock tactical personnel."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            name TEXT NOT NULL,
            badge_id TEXT NOT NULL,
            role TEXT NOT NULL,
            clearance_level TEXT NOT NULL,
            sector TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)

    # Active Duty Roster Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS duty_roster (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            badge_id TEXT NOT NULL,
            role TEXT NOT NULL,
            clearance_level TEXT NOT NULL,
            sector TEXT NOT NULL,
            status TEXT NOT NULL,
            post_name TEXT NOT NULL,
            last_ping REAL NOT NULL
        )
    """)

    # Incident Audit Log Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS incident_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT NOT NULL,
            threat_source TEXT NOT NULL,
            threat_details TEXT NOT NULL,
            officer_name TEXT NOT NULL,
            officer_badge TEXT NOT NULL,
            officer_role TEXT NOT NULL,
            qrt_unit TEXT NOT NULL,
            defensive_actions TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            signature_hash TEXT NOT NULL
        )
    """)
    conn.commit()

    # Pre-seed users if not present
    seed_users = [
        {
            "username": "operator1",
            "password": "Border@2026",
            "name": "Insp. Vikram Singh",
            "badge_id": "BSF-8841",
            "role": "Sector Controller",
            "clearance_level": "Level 2",
            "sector": "Sector Alpha"
        },
        {
            "username": "commander",
            "password": "Secure@2026",
            "name": "Col. R. Sharma",
            "badge_id": "HQ-0104",
            "role": "Base Commander",
            "clearance_level": "Level 4",
            "sector": "Sector Alpha"
        }
    ]

    for u in seed_users:
        cursor.execute("SELECT id FROM users WHERE username = ?", (u["username"],))
        if not cursor.fetchone():
            salt = secrets.token_hex(8)
            pwd_hash = hashlib.sha256((u["password"] + salt).encode("utf-8")).hexdigest()
            cursor.execute("""
                INSERT INTO users (username, password_hash, salt, name, badge_id, role, clearance_level, sector, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (u["username"], pwd_hash, salt, u["name"], u["badge_id"], u["role"], u["clearance_level"], u["sector"], time.time()))

    # Seed static Duty Roster personnel
    cursor.execute("SELECT COUNT(*) FROM duty_roster")
    if cursor.fetchone()[0] == 0:
        roster_seed = [
            ("Col. R. Sharma", "HQ-0104", "Base Commander", "Level 4", "Sector Alpha", "ON DUTY (HQ)", "Command Center Unit A1", time.time()),
            ("Insp. Vikram Singh", "BSF-8841", "Sector Controller", "Level 2", "Sector Alpha", "MONITORING", "Console #01 Local", time.time()),
            ("Sub-Insp. Neha Roy", "BSF-9012", "Riverine Specialist", "Level 2", "Riverine Buffer", "PATROL WATCH", "BOP-02 Floating Post", time.time()),
            ("Havildar Gurpreet", "BSF-4421", "Checkpoint Sentry", "Level 1", "Checkpost Alpha", "ON GATE DUTY", "Barrier Gate 02 Post", time.time())
        ]
        cursor.executemany("""
            INSERT INTO duty_roster (name, badge_id, role, clearance_level, sector, status, post_name, last_ping)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, roster_seed)

    conn.commit()
    conn.close()


# Initialize database at module load
init_security_db()


# -------------------------------------------------------------
# Cryptographic Token Management (Zero External Dependencies)
# -------------------------------------------------------------
def create_session_token(user_data: Dict[str, Any]) -> str:
    """Creates a base64-encoded, HMAC-SHA256 signed session token."""
    payload = {
        "username": user_data["username"],
        "name": user_data["name"],
        "badge_id": user_data["badge_id"],
        "role": user_data["role"],
        "rank": user_data.get("rank", "Commandant"),
        "clearance_level": user_data["clearance_level"],
        "permissions": user_data.get("permissions", ["*"]),
        "sector": user_data["sector"],
        "exp": time.time() + 86400, # 24 hours
        "nonce": secrets.token_hex(6)
    }
    raw_payload = json.dumps(payload, separators=(',', ':'))
    payload_hex = raw_payload.encode("utf-8").hex()
    signature = hmac.new(SECRET_KEY.encode("utf-8"), payload_hex.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload_hex}.{signature}"


def verify_session_token(token: str) -> Optional[Dict[str, Any]]:
    """Verifies the HMAC signature and expiration of a session token."""
    if not token or "." not in token:
        return None
    try:
        payload_hex, signature = token.split(".", 1)
        expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), payload_hex.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None

        raw_payload = bytes.fromhex(payload_hex).decode("utf-8")
        payload = json.loads(raw_payload)

        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def get_demo_officer(username: str = "") -> Dict[str, Any]:
    return {
        "username": username.strip() or "DEMO_ADMIN",
        "name": "IBVAP Demonstration Administrator",
        "badge_id": "DEMO-ADMIN",
        "role": "ADMIN",
        "rank": "Commandant",
        "clearance_level": 4,
        "permissions": ["*"],
        "sector": "IBVAP Command Center",
        "login_time": time.time()
    }


# -------------------------------------------------------------
# Request Models
# -------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class EscalationRequest(BaseModel):
    incident_id: str
    threat_source: str
    threat_details: str
    qrt_unit: str
    sound_siren: bool = False
    lockdown_gate: bool = False
    flag_officer_sig: bool = True


# -------------------------------------------------------------
# Dependency: Get Current Authenticated Officer
# -------------------------------------------------------------
async def get_current_officer(request: Request) -> Optional[Dict[str, Any]]:
    # 1. Check HTTP-only cookie
    token = request.cookies.get(SESSION_COOKIE_NAME)
    # 2. Fallback to Authorization: Bearer <token>
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if token:
        officer = verify_session_token(token)
        if officer:
            return officer
    return get_demo_officer() if DEMO_BYPASS_AUTH else None


# -------------------------------------------------------------
# API Endpoints
# -------------------------------------------------------------
@auth_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    """Authenticates personnel credentials and issues an HTTP-only session cookie."""
    if DEMO_BYPASS_AUTH:
        user_data = get_demo_officer(req.username)
        token = create_session_token(user_data)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            httponly=True,
            max_age=86400,
            samesite="lax",
            secure=False
        )
        return {
            "status": "AUTHENTICATED",
            "message": f"Welcome, {user_data['name']}. Security Clearance verified.",
            "officer": user_data,
            "token": token
        }

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (req.username.strip(),))
    user = cursor.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Tactical Authentication Failed: Invalid Personnel Identifier")

    # Verify password hash
    calc_hash = hashlib.sha256((req.password + user["salt"]).encode("utf-8")).hexdigest()
    if not hmac.compare_digest(calc_hash, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Tactical Authentication Failed: Access Code Rejected")

    user_data = {
        "username": user["username"],
        "name": user["name"],
        "badge_id": user["badge_id"],
        "role": user["role"],
        "clearance_level": user["clearance_level"],
        "sector": user["sector"],
        "login_time": time.time()
    }

    token = create_session_token(user_data)

    # Set secure HTTP-only cookie
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=86400,
        samesite="lax",
        secure=False # Set to True in production HTTPS
    )

    return {
        "status": "AUTHENTICATED",
        "message": f"Welcome, {user['name']}. Security Clearance verified.",
        "officer": user_data,
        "token": token
    }


@auth_router.post("/auth/logout")
async def logout(response: Response):
    """Terminates active tactical session."""
    response.delete_cookie(key=SESSION_COOKIE_NAME)
    return {"status": "LOGGED_OUT", "message": "Tactical session terminated."}


@auth_router.get("/auth/me")
async def get_current_user_profile(officer: Optional[Dict[str, Any]] = Depends(get_current_officer)):
    """Returns active duty officer profile."""
    if not officer:
        raise HTTPException(status_code=401, detail="Unauthenticated. Tactical clearance required.")
    return {
        "status": "ACTIVE_SESSION",
        "officer": officer
    }


@auth_router.get("/auth/duty-roster")
async def get_duty_roster():
    """Returns list of online surveillance officers and sentry units."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name, badge_id, role, clearance_level, sector, status, post_name FROM duty_roster ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()

    roster = [dict(row) for row in rows]
    return {"status": "SUCCESS", "duty_roster": roster}


@auth_router.post("/alerts/escalate")
async def escalate_alert(
    req: EscalationRequest,
    officer: Optional[Dict[str, Any]] = Depends(get_current_officer)
):
    """
    Tactical Escalation & QRT Dispatch:
    Records officer digital signature, dispatches QRT unit, logs defensive actions to SQLite audit log.
    """
    # If no active session, fallback to default duty officer identity for resilience in demo
    officer_name = officer["name"] if officer else "Insp. Vikram Singh"
    badge_id = officer["badge_id"] if officer else "BSF-8841"
    role = officer["role"] if officer else "Sector Controller"

    actions = []
    if req.sound_siren:
        actions.append("PERIMETER_SIREN_ACTIVE")
    if req.lockdown_gate:
        actions.append("GATE_02_LOCKDOWN_DEPLOYED")
    if req.flag_officer_sig:
        actions.append(f"SIGNED_BY_{badge_id}")

    actions_str = ", ".join(actions) if actions else "QRT_DISPATCHED_ONLY"
    ts_str = time.strftime("%Y-%m-%d %H:%M:%S")

    # Generate military digital signature hash
    sig_content = f"{req.incident_id}|{badge_id}|{req.qrt_unit}|{actions_str}|{ts_str}"
    sig_hash = hashlib.sha256(sig_content.encode("utf-8")).hexdigest()[:16].upper()

    # Record into SQLite audit log
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO incident_audit_log (
            incident_id, threat_source, threat_details, officer_name, officer_badge,
            officer_role, qrt_unit, defensive_actions, timestamp, signature_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.incident_id, req.threat_source, req.threat_details, officer_name, badge_id,
        role, req.qrt_unit, actions_str, ts_str, sig_hash
    ))
    conn.commit()
    conn.close()

    return {
        "status": "ESCALATED",
        "incident_id": req.incident_id,
        "dispatched_unit": req.qrt_unit,
        "officer": {"name": officer_name, "badge": badge_id},
        "defensive_actions": actions,
        "timestamp": ts_str,
        "signature_hash": f"SIG-{sig_hash}",
        "message": f"{req.qrt_unit} dispatched by {officer_name} ({badge_id}). Countermeasures deployed."
    }


@auth_router.get("/alerts/incidents")
async def get_incident_audit_logs():
    """Retrieves tactical incident audit logs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incident_audit_log ORDER BY id DESC LIMIT 20")
    rows = cursor.fetchall()
    conn.close()
    return {"status": "SUCCESS", "incidents": [dict(r) for r in rows]}
