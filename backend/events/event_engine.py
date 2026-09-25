"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Normalized Tactical Event Engine
Computes threat scores and alerts strictly from observable computer-vision events:
- Restricted zone intrusions
- Virtual fence crossings
- Multi-target grouping
- Extended dwell / loitering
- Face recognition watchlist matches
- Dedicated ANPR detections
- Abnormal speed & trajectory violations
(Facial emotion FER+ is isolated as an optional diagnostic attribute only)
"""

import time
import logging
from typing import Dict, Any, List, Optional, Tuple
from collections import defaultdict
from datetime import datetime, timezone

from backend.database import get_db_connection

logger = logging.getLogger("IBVAP.EventEngine")

# Cooldown durations in seconds per alert key to prevent event flooding
ALERT_COOLDOWNS = {
    "ZONE_INTRUSION": 8,
    "FENCE_CROSSING": 6,
    "LOITERING": 15,
    "FACE_MATCH": 15,
    "ANPR_DETECTED": 15,
    "PERSON_DETECTED": 12,
    "VEHICLE_DETECTED": 15,
    "ABNORMAL_MOVEMENT": 10,
}

THREAT_WEIGHTS = {
    "person_in_zone": 45,
    "fence_crossing": 55,
    "loitering": 30,
    "multiple_in_zone": 15,
    "vehicle_in_zone": 40,
    "face_match": 45,
    "abnormal_speed": 20,
}


class SurveillanceEventEngine:
    """
    Evaluates real-time vision telemetry and produces normalized surveillance events
    and structured alerts for the RAKSHAN Command Center.
    """

    def __init__(self, camera_id: str = "CAM-01"):
        self.camera_id = camera_id
        self._last_alert_time: Dict[str, float] = defaultdict(float)

    def _can_fire(self, key: str, cooldown_type: str = "ZONE_INTRUSION") -> bool:
        cooldown = ALERT_COOLDOWNS.get(cooldown_type, 10)
        now = time.time()
        if now - self._last_alert_time[key] >= cooldown:
            self._last_alert_time[key] = now
            return True
        return False

    def process(
        self,
        tracks: List[Dict[str, Any]],
        face_matches: Optional[List[Dict[str, Any]]] = None,
        anpr_results: Optional[List[Dict[str, Any]]] = None,
        fence_events: Optional[List[Dict[str, Any]]] = None,
        camera_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Processes normalized tracks and detections into alerts and database events.
        """
        cam_id = camera_id or self.camera_id
        now_ts = datetime.now(timezone.utc).isoformat()
        now_epoch = time.time()

        alerts = []
        events = []
        face_matches = face_matches or []
        anpr_results = anpr_results or []
        fence_events = fence_events or []

        # Count categories
        person_tracks = [t for t in tracks if t.get("category") == "person"]
        vehicle_tracks = [t for t in tracks if t.get("category") == "vehicle"]

        persons_in_zone = [t for t in person_tracks if t.get("in_restricted_zone")]
        vehicles_in_zone = [t for t in vehicle_tracks if t.get("in_restricted_zone")]
        loitering_tracks = [t for t in tracks if t.get("loitering")]

        session_threat = 0

        # ── 1. Evaluate Target Telemetry & Zone Violations ────────────────────
        for trk in tracks:
            tid = trk.get("track_id", "T-000")
            cat = trk.get("category", "person")
            cname = trk.get("class_name", cat).upper()
            conf = trk.get("confidence_pct", 85.0)
            in_zone = trk.get("in_restricted_zone", False)
            loitering = trk.get("loitering", False)
            dwell = trk.get("dwell_seconds", 0.0)
            direction = trk.get("direction", "STATIONARY")
            speed = trk.get("relative_speed", 0.0)

            target_threat = 5
            reasons = []

            if in_zone:
                target_threat += THREAT_WEIGHTS["person_in_zone"] if cat == "person" else THREAT_WEIGHTS["vehicle_in_zone"]
                reasons.append(f"{cname} in restricted zone")

                if len(persons_in_zone) > 1:
                    target_threat += THREAT_WEIGHTS["multiple_in_zone"]
                    reasons.append(f"Multiple targets in zone ({len(persons_in_zone)})")

                # Zone intrusion alert
                key = f"INTRUSION:{cam_id}:{tid}"
                if self._can_fire(key, "ZONE_INTRUSION"):
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10000}",
                        "severity": "CRITICAL" if len(persons_in_zone) > 1 or speed > 100 else "HIGH",
                        "event_type": "ZONE_INTRUSION",
                        "title": f"RESTRICTED ZONE ENTRY: {tid} ({cname})",
                        "camera": cam_id,
                        "sector": "Sector Alpha",
                        "targetId": tid,
                        "confidence": int(conf),
                        "timestamp": time.strftime("%H:%M:%S"),
                        "status": "ACTIVE",
                        "description": f"Target {tid} detected inside restricted perimeter. Direction: {direction}. Dwell: {dwell:.0f}s.",
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)

                    event_record = {
                        "camera_id": cam_id,
                        "event_type": "ZONE_INTRUSION",
                        "severity": alert_item["severity"],
                        "title": alert_item["title"],
                        "details": alert_item["description"],
                        "track_id": tid,
                        "confidence": conf,
                        "timestamp": now_ts
                    }
                    events.append(event_record)
                    self._persist_event(event_record)

            if loitering:
                target_threat += THREAT_WEIGHTS["loitering"]
                reasons.append(f"Loitering ({dwell:.0f}s)")

                key = f"LOITERING:{cam_id}:{tid}"
                if self._can_fire(key, "LOITERING"):
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10000}",
                        "severity": "HIGH",
                        "event_type": "LOITERING",
                        "title": f"LOITERING ALERT: {tid} ({dwell:.0f}s dwell)",
                        "camera": cam_id,
                        "sector": "Sector Alpha",
                        "targetId": tid,
                        "confidence": int(conf),
                        "timestamp": time.strftime("%H:%M:%S"),
                        "status": "ACTIVE",
                        "description": f"Target {tid} persistent dwell time exceeded threshold in monitored zone.",
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)

                    event_record = {
                        "camera_id": cam_id,
                        "event_type": "LOITERING",
                        "severity": "HIGH",
                        "title": alert_item["title"],
                        "details": alert_item["description"],
                        "track_id": tid,
                        "confidence": conf,
                        "timestamp": now_ts
                    }
                    events.append(event_record)
                    self._persist_event(event_record)

            if speed > 150:
                target_threat += THREAT_WEIGHTS["abnormal_speed"]
                reasons.append("Abnormal rapid movement")

            session_threat = max(session_threat, target_threat)

        # ── 2. Evaluate Virtual Fence Crossings ──────────────────────────────
        for fe in fence_events:
            tid = fe.get("track_id", "UNKNOWN")
            key = f"FENCE:{cam_id}:{tid}"
            if self._can_fire(key, "FENCE_CROSSING"):
                session_threat = max(session_threat, 85)
                alert_item = {
                    "id": f"ALT-{int(now_epoch * 10) % 90000 + 10000}",
                    "severity": "CRITICAL",
                    "event_type": "FENCE_CROSSING",
                    "title": f"VIRTUAL FENCE BREACH: {fe.get('fence_name', 'Zero-Line')}",
                    "camera": cam_id,
                    "sector": "Sector Alpha",
                    "targetId": tid,
                    "confidence": 94,
                    "timestamp": time.strftime("%H:%M:%S"),
                    "status": "ACTIVE",
                    "description": f"Target {tid} breached virtual zero-line barrier boundary.",
                    "is_real_ai": True
                }
                alerts.append(alert_item)
                event_rec = {
                    "camera_id": cam_id,
                    "event_type": "VIRTUAL_FENCE_CROSSING",
                    "severity": "CRITICAL",
                    "title": alert_item["title"],
                    "details": alert_item["description"],
                    "track_id": tid,
                    "confidence": 94.0,
                    "timestamp": now_ts
                }
                events.append(event_rec)
                self._persist_event(event_rec)

        # ── 3. Evaluate Facial Watchlist Matches ──────────────────────────────
        for fm in face_matches:
            if fm.get("face_match") and fm.get("person_code"):
                pcode = fm["person_code"]
                pname = fm.get("display_name", pcode)
                sim = fm.get("similarity", 0.0)
                istatus = fm.get("identity_status", "WATCHLIST")

                session_threat = max(session_threat, 75 if istatus == "WATCHLIST" else 20)
                key = f"FACE_MATCH:{cam_id}:{pcode}"
                if self._can_fire(key, "FACE_MATCH"):
                    sev = "CRITICAL" if istatus == "WATCHLIST" else "INFO"
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10000}",
                        "severity": sev,
                        "event_type": "FACE_MATCH",
                        "title": f"WATCHLIST MATCH: {pname} [{pcode}]" if istatus == "WATCHLIST" else f"AUTHORIZED PERSON: {pname}",
                        "camera": cam_id,
                        "sector": "Sector Alpha",
                        "targetId": pcode,
                        "confidence": int(sim * 100),
                        "timestamp": time.strftime("%H:%M:%S"),
                        "status": "ACTIVE",
                        "description": f"Facial recognition match: {pname} (Code: {pcode}, Sim: {sim*100:.1f}%, Status: {istatus}).",
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)
                    event_rec = {
                        "camera_id": cam_id,
                        "event_type": "FACE_MATCH",
                        "severity": sev,
                        "title": alert_item["title"],
                        "details": alert_item["description"],
                        "track_id": pcode,
                        "confidence": sim * 100,
                        "timestamp": now_ts
                    }
                    events.append(event_rec)
                    self._persist_event(event_rec)

        # ── 4. Evaluate ANPR Events ──────────────────────────────────────────
        for anpr in anpr_results:
            if anpr.get("is_valid") and anpr.get("plate_text"):
                plate = anpr["plate_text"]
                pconf = anpr.get("confidence", 85.0)
                vtid = anpr.get("vehicle_track_id", "VEHICLE")

                key = f"ANPR:{cam_id}:{plate}"
                if self._can_fire(key, "ANPR_DETECTED"):
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10000}",
                        "severity": "INFO",
                        "event_type": "ANPR_DETECTED",
                        "title": f"ANPR LOGGED: {anpr.get('formatted_plate', plate)}",
                        "camera": cam_id,
                        "sector": "Sector Delta",
                        "targetId": vtid,
                        "confidence": int(pconf),
                        "timestamp": time.strftime("%H:%M:%S"),
                        "status": "ACTIVE",
                        "description": f"Plate recognized on {vtid}: {plate} (Confidence: {pconf:.1f}%).",
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)
                    event_rec = {
                        "camera_id": cam_id,
                        "event_type": "ANPR_DETECTED",
                        "severity": "INFO",
                        "title": alert_item["title"],
                        "details": alert_item["description"],
                        "track_id": vtid,
                        "confidence": pconf,
                        "timestamp": now_ts
                    }
                    events.append(event_rec)
                    self._persist_event(event_rec)

        session_threat = min(100, max(0, session_threat))

        return {
            "threat_score": session_threat,
            "alerts": alerts,
            "events": events,
            "kpis": {
                "persons_count": len(person_tracks),
                "vehicles_count": len(vehicle_tracks),
                "active_tracks": len(tracks),
                "zone_intrusions": len(persons_in_zone) + len(vehicles_in_zone),
                "loitering_count": len(loitering_tracks),
                "face_matches": len([f for f in face_matches if f.get("face_match")]),
                "anpr_events": len([a for a in anpr_results if a.get("is_valid")]),
            }
        }

    @staticmethod
    def _persist_event(event: Dict[str, Any]):
        """Persists a real CV event to the security_events table."""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO security_events (camera_id, event_type, severity, title, details, track_id, confidence, timestamp, snapshot_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event.get("camera_id", "CAM-01"),
                event.get("event_type", "GENERIC"),
                event.get("severity", "INFO"),
                event.get("title", ""),
                event.get("details", ""),
                event.get("track_id"),
                event.get("confidence", 0.0),
                event.get("timestamp", datetime.now(timezone.utc).isoformat()),
                event.get("snapshot_path")
            ))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.debug(f"Event persist exception: {e}")
