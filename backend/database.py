"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
SQLite Database Layer: Operators, Audit Logs & Incidents
"""

import os
import sqlite3
import hashlib
import secrets
import time
import json
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

    # 4. Known Suspects / Watchlist & Personnel Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS known_suspects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_code TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            embedding TEXT NOT NULL,
            embedding_model TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'WATCHLIST',
            metadata TEXT
        )
    """)

    # 5. Real Detections Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS detections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            class_name TEXT NOT NULL,
            category TEXT NOT NULL,
            confidence REAL NOT NULL,
            bbox_json TEXT NOT NULL,
            track_id TEXT
        )
    """)

    # 6. Persistent Tracks Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            category TEXT NOT NULL,
            class_name TEXT NOT NULL,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            total_frames INTEGER DEFAULT 1,
            max_confidence REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE'
        )
    """)

    # 7. ANPR Events Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS anpr_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id TEXT NOT NULL,
            vehicle_track_id TEXT,
            plate_text TEXT NOT NULL,
            ocr_confidence REAL NOT NULL,
            timestamp TEXT NOT NULL,
            snapshot_path TEXT,
            status TEXT NOT NULL DEFAULT 'VERIFIED'
        )
    """)

    # 8. Security Events Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS security_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            details TEXT,
            track_id TEXT,
            confidence REAL,
            timestamp TEXT NOT NULL,
            snapshot_path TEXT
        )
    """)

    # 9. Cameras Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cameras (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sector TEXT NOT NULL,
            source_type TEXT NOT NULL,
            stream_url TEXT,
            status TEXT NOT NULL DEFAULT 'ONLINE',
            is_active INTEGER DEFAULT 1,
            fps REAL DEFAULT 30.0
        )
    """)

    conn.commit()

    # Seed required officer accounts if missing
    seed_operators = [
        {
            "user_id": "admin",
            "password": "admin123",
            "full_name": "Insp. Vikram Singh",
            "rank": "Sector Commander",
            "clearance_level": 4,
            "avatar_url": "tactical_commander_crest",
            "active_shift": "06:00 - 18:00 (Alpha Day Watch)",
            "assigned_sector": "Sector Alpha - Post 04"
        },
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

    # Seed default camera entries if missing
    seed_cameras = [
        {"id": "CAM-01", "name": "Sector Alpha [Local Optical]", "sector": "Sector Alpha", "source_type": "LOCAL_WEBCAM", "stream_url": None, "status": "ONLINE", "fps": 30.0},
        {"id": "CAM-02", "name": "Sector Bravo [Perimeter Night Vision]", "sector": "Sector Bravo", "source_type": "EDGE_NODE", "stream_url": "/video_feed/cam2", "status": "ONLINE", "fps": 25.0},
        {"id": "CAM-03", "name": "Sector Charlie [Riverine FLIR Thermal]", "sector": "Sector Charlie", "source_type": "IP_CCTV", "stream_url": "/video_feed/cam3", "status": "ONLINE", "fps": 25.0},
        {"id": "CAM-04", "name": "Sector Delta [Checkpost Barrier ANPR]", "sector": "Sector Delta", "source_type": "ANPR_BARRIER", "stream_url": "/video_feed/cam4", "status": "ONLINE", "fps": 25.0},
    ]
    for cam in seed_cameras:
        cursor.execute("SELECT id FROM cameras WHERE id = ?", (cam["id"],))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO cameras (id, name, sector, source_type, stream_url, status, is_active, fps)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """, (cam["id"], cam["name"], cam["sector"], cam["source_type"], cam["stream_url"], cam["status"], cam["fps"]))

    # Seed known_suspects baseline watchlist entry if empty
    cursor.execute("SELECT COUNT(*) FROM known_suspects")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO known_suspects (person_code, display_name, embedding, embedding_model, created_at, updated_at, status, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "WATCH-014",
            "Person of Interest #14",
            "[]",
            "SFace-128D",
            "2026-09-25T06:00:00Z",
            "2026-09-25T06:00:00Z",
            "WATCHLIST",
            json.dumps({"notes": "Monitored cross-border subject", "priority": "HIGH"})
        ))

    conn.commit()
    conn.close()


# Auto-initialize database
init_db()
