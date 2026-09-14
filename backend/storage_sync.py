"""Offline SQLite event buffer and simulated central sync worker."""

import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import cv2


class StorageSyncManager:
    def __init__(self, project_root: Optional[str] = None):
        self.project_root = project_root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.database_path = os.path.join(self.project_root, "ibvap_edge.db")
        self.snapshot_dir = os.path.join(self.project_root, "static", "snapshots")
        os.makedirs(self.snapshot_dir, exist_ok=True)
        self._lock = threading.Lock()
        self._online = True
        self._stop = threading.Event()
        self._initialize_schema()
        self._worker = threading.Thread(target=self._sync_loop, name="ibvap-sync", daemon=True)
        self._worker.start()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize_schema(self) -> None:
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    camera_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    object_type TEXT,
                    severity TEXT NOT NULL,
                    snapshot_path TEXT,
                    sync_status TEXT NOT NULL DEFAULT 'PENDING'
                )
            """)

    @property
    def online(self) -> bool:
        return self._online

    def set_network_state(self, online: bool) -> Dict[str, Any]:
        self._online = bool(online)
        return self.status()

    def record_event(self, camera_id: str, event_type: str, object_type: str,
                     severity: str, frame=None) -> Dict[str, Any]:
        snapshot_path = None
        if frame is not None and (event_type.upper() == "INTRUSION" or severity.upper() == "HIGH"):
            snapshot_path = self.save_snapshot(frame, camera_id, event_type)
        sync_status = "SYNCED" if self.online else "PENDING"
        timestamp = datetime.now(timezone.utc).isoformat()
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO events (camera_id, timestamp, event_type, object_type, severity, snapshot_path, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (camera_id, timestamp, event_type, object_type, severity, snapshot_path, sync_status),
            )
            return {"id": cursor.lastrowid, "sync_status": sync_status, "snapshot_path": snapshot_path}

    def save_snapshot(self, frame, camera_id: str, event_type: str) -> str:
        filename = f"{camera_id}_{event_type.lower()}_{int(time.time() * 1000)}.jpg"
        absolute_path = os.path.join(self.snapshot_dir, filename)
        if not cv2.imwrite(absolute_path, frame):
            raise IOError(f"Could not write snapshot: {absolute_path}")
        return f"/static/snapshots/{filename}"

    def pending_events(self) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM events WHERE sync_status = 'PENDING' ORDER BY id").fetchall()
        return [dict(row) for row in rows]

    def status(self) -> Dict[str, Any]:
        with self._connect() as connection:
            pending = connection.execute("SELECT COUNT(*) FROM events WHERE sync_status = 'PENDING'").fetchone()[0]
        return {"online": self.online, "pending_sync": pending, "label": "ONLINE" if self.online else "OFFLINE"}

    def _sync_loop(self) -> None:
        while not self._stop.wait(2.0):
            if not self.online:
                continue
            with self._lock, self._connect() as connection:
                connection.execute("UPDATE events SET sync_status = 'SYNCED' WHERE sync_status = 'PENDING'")

    def close(self) -> None:
        self._stop.set()