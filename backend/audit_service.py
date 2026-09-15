"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Audit Logging Service & Interceptor
Authoritative backend recording of security-critical actions.
"""

import time
from typing import Optional, Dict, Any, List
from fastapi import Request
from backend.database import get_db_connection


def audit_event(
    user_id: str,
    action: str,
    target: str,
    details: Optional[str] = None,
    request: Optional[Request] = None,
    session_id: Optional[str] = None
) -> int:
    """
    Authoritative backend audit logger.
    Records every security-relevant action into SQLite user_audit_log table.
    """
    # Authoritative backend timestamp in YYYY-MM-DD HH:MM:SS format
    ts_str = time.strftime("%Y-%m-%d %H:%M:%S")

    ip_address = "127.0.0.1"
    if request:
        client = getattr(request, "client", None)
        if client and hasattr(client, "host"):
            ip_address = client.host
        # Also check x-forwarded-for if behind reverse proxy
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip_address = forwarded.split(",")[0].strip()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_audit_log (
            user_id, timestamp, action, target, details, ip_address, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        ts_str,
        action.upper(),
        target,
        details or "",
        ip_address,
        session_id or ""
    ))
    conn.commit()
    inserted_id = cursor.lastrowid
    conn.close()
    return inserted_id


def get_audit_logs(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Fetches newest audit logs joined with operator details.
    Restricted to Level 4 Commander accounts.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            a.id,
            a.user_id,
            a.timestamp,
            a.action,
            a.target,
            a.details,
            a.ip_address,
            o.full_name,
            o.rank,
            o.clearance_level
        FROM user_audit_log a
        LEFT JOIN operators o ON a.user_id = o.user_id
        ORDER BY a.id DESC
        LIMIT ? OFFSET ?
    """, (limit, offset))
    rows = cursor.fetchall()
    conn.close()

    logs = []
    for r in rows:
        logs.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "timestamp": r["timestamp"],
            "action": r["action"],
            "target": r["target"],
            "details": r["details"],
            "ip_address": r["ip_address"],
            "full_name": r["full_name"] or "SYSTEM / UNKNOWN",
            "rank": r["rank"] or "N/A",
            "clearance_level": r["clearance_level"] or 0
        })
    return logs
