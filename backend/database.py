"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
SQLite Database Layer: Operators, Audit Logs & Incidents
"""

import os
import sqlite3
import hashlib
import secrets
import time
from typing import Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "security.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str, salt: str) -> str:
    """PBKDF2-HMAC-SHA256 password hashing with 100,000 iterations."""
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000
    ).hex()


def init_db():
    """Initializes the SQLite database with operators and user_audit_log tables."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Operators Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS operators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            full_name TEXT NOT NULL,
            rank TEXT NOT NULL,
            clearance_level INTEGER NOT NULL,
            avatar_url TEXT,
            active_shift TEXT,
            assigned_sector TEXT NOT NULL
        )
    """)

    # 2. User Audit Log Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            action TEXT NOT NULL,
            target TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            session_id TEXT
        )
    """)

    # 3. Incident Audit Log Table (extended with first_responder_id)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS incident_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT NOT NULL,
            threat_source TEXT NOT NULL,
            threat_details TEXT NOT NULL,
            first_responder_id TEXT NOT NULL,
            officer_name TEXT NOT NULL,
            officer_rank TEXT NOT NULL,
            qrt_unit TEXT NOT NULL,
            defensive_actions TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            signature_hash TEXT NOT NULL
        )
    """)

    conn.commit()

    # Seed required officer accounts if missing
    seed_operators = [
        {
            "user_id": "HQ-CDR-01",
            "password": "Commander@2026",
            "full_name": "Brig. Ajay Verma",
            "rank": "Sector Commander",
            "clearance_level": 4,
            "avatar_url": "tactical_commander_crest",
            "active_shift": "06:00 - 18:00 (Alpha Day Watch)",
            "assigned_sector": "Sector Alpha - Post 04"
        },
        {
            "user_id": "OP-SECT-04",
            "password": "Operator@2026",
            "full_name": "Sub-Insp. Neeraj Rao",
            "rank": "Perimeter Operator",
            "clearance_level": 2,
            "avatar_url": "tactical_soldier_badge",
            "active_shift": "14:00 - 22:00 (Sector Watch)",
            "assigned_sector": "Sector Alpha - Post 04"
        },
        {
            "user_id": "operator1",
            "password": "Border@2026",
            "full_name": "Insp. Vikram Singh",
            "rank": "Sector Controller",
            "clearance_level": 2,
            "avatar_url": "tactical_soldier_badge",
            "active_shift": "08:00 - 20:00 (Standard Shift)",
            "assigned_sector": "Sector Alpha - Post 04"
        }
    ]

    for op in seed_operators:
        cursor.execute("SELECT id FROM operators WHERE user_id = ?", (op["user_id"],))
        if not cursor.fetchone():
            salt = secrets.token_hex(16)
            pwd_hash = hash_password(op["password"], salt)
            cursor.execute("""
                INSERT INTO operators (
                    user_id, password_hash, salt, full_name, rank,
                    clearance_level, avatar_url, active_shift, assigned_sector
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                op["user_id"], pwd_hash, salt, op["full_name"], op["rank"],
                op["clearance_level"], op["avatar_url"], op["active_shift"], op["assigned_sector"]
            ))
        else:
            # Ensure passwords and ranks match the seed specification
            salt = secrets.token_hex(16)
            pwd_hash = hash_password(op["password"], salt)
            cursor.execute("""
                UPDATE operators SET
                    password_hash = ?, salt = ?, full_name = ?, rank = ?,
                    clearance_level = ?, avatar_url = ?, active_shift = ?, assigned_sector = ?
                WHERE user_id = ?
            """, (
                pwd_hash, salt, op["full_name"], op["rank"],
                op["clearance_level"], op["avatar_url"], op["active_shift"], op["assigned_sector"],
                op["user_id"]
            ))

    conn.commit()
    conn.close()


# Auto-initialize database
init_db()
