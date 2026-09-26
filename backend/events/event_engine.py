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
    "PROLONGED_PRESENCE": 18,
    "FACE_MATCH": 15,
    "ANPR_DETECTED": 15,
    "PERSON_DETECTED": 25,
    "VEHICLE_DETECTED": 20,
    "ABNORMAL_MOVEMENT": 12,
    "SECURITY_OBJECT": 6,
}

THREAT_WEIGHTS = {
    "person_in_zone": 40,
    "fence_crossing": 55,
    "loitering": 25,
    "prolonged_presence": 12,
    "multiple_in_zone": 15,
    "vehicle_in_zone": 40,
    "face_match": 45,
    "abnormal_speed": 18,
    "carrying_bag_in_zone": 10,
}


class SurveillanceEventEngine:
    """
    Evaluates real-time vision telemetry and produces normalized surveillance events,
    explainable threat scores, and structured alerts (INFO, LOW, MEDIUM, HIGH, CRITICAL)
    for the IBVAP Command Center.
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
        Processes normalized tracks and detections into explainable alerts and database events.
        """
        cam_id = camera_id or self.camera_id
        now_ts = datetime.now(timezone.utc).isoformat()
        now_epoch = time.time()
        time_str = time.strftime("%H:%M:%S")

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
        global_contributing_signals: List[Dict[str, Any]] = []
        global_reasons: List[str] = []

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
            holding_status = trk.get("holding_status", "NONE")
            activity = trk.get("activity", "MONITORED")

            target_threat = 10
            signals = []
            reasons = []

            if in_zone:
                pts = THREAT_WEIGHTS["person_in_zone"] if cat == "person" else THREAT_WEIGHTS["vehicle_in_zone"]
                target_threat += pts
                signals.append({"signal": f"Restricted zone entry ({cname})", "points": pts})
                reasons.append(f"{cname.title()} {tid} entered restricted zone")

                if dwell >= 3.0:
                    reasons.append(f"{cname.title()} remained inside restricted zone for {dwell:.0f} seconds")

                if holding_status and holding_status != "NONE":
                    target_threat += THREAT_WEIGHTS["carrying_bag_in_zone"]
                    signals.append({"signal": f"Subject {holding_status.lower()} in restricted zone", "points": 10})
                    reasons.append(f"Subject observed with {holding_status}")

                if len(persons_in_zone) > 1:
                    target_threat += THREAT_WEIGHTS["multiple_in_zone"]
                    signals.append({"signal": f"Multiple subjects in restricted zone ({len(persons_in_zone)})", "points": 15})
                    reasons.append(f"Multiple subjects gathering in restricted zone ({len(persons_in_zone)})")

                # Zone intrusion alert (HIGH or CRITICAL)
                key = f"INTRUSION:{cam_id}:{tid}"
                if self._can_fire(key, "ZONE_INTRUSION"):
                    sev = "CRITICAL" if (len(persons_in_zone) > 1 and loitering) or speed > 140 else "HIGH"
                    obj_desc = f"{cname.title()} {tid}" + (f" ({holding_status})" if holding_status and holding_status != "NONE" else "")
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10000}",
                        "severity": sev,
                        "event_type": "ZONE_INTRUSION",
                        "title": f"RESTRICTED ZONE ENTRY: {tid} ({cname})",
                        "camera": cam_id,
                        "sector": "BORDER ZONE A (Sector Alpha)",
                        "targetId": tid,
                        "confidence": int(conf),
                        "timestamp": time_str,
                        "status": "ACTIVE",
                        "description": f"Target {tid} detected inside restricted perimeter. Activity: {activity}. Direction: {direction}. Dwell: {dwell:.0f}s.",
                        "risk_score": min(100, target_threat),
                        "contributing_signals": signals,
                        "reasons": [f"{idx+1}. {r}" for idx, r in enumerate(reasons)],
                        "explainability": {
                            "what": f"{cname.title()} entered restricted zone ({activity})",
                            "where": f"{cam_id} / BORDER ZONE A (Sector Alpha)",
                            "when": time_str,
                            "object": obj_desc,
                            "why": "; ".join(reasons) or "Restricted boundary crossed",
                            "confidence": int(conf),
                        },
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)

                    event_record = {
                        "id": f"EV-{int(now_epoch * 100) % 900000}",
                        "time": time_str,
                        "camera_id": cam_id,
                        "sector": "Sector Alpha",
                        "type": "ZONE_INTRUSION",
                        "event_type": "ZONE_INTRUSION",
                        "severity": sev,
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
                signals.append({"signal": f"Prolonged loitering ({dwell:.0f}s)", "points": THREAT_WEIGHTS["loitering"]})
                reasons.append(f"Prolonged presence inside monitored zone ({dwell:.0f}s)")

                key = f"LOITERING:{cam_id}:{tid}"
                if self._can_fire(key, "LOITERING"):
                    sev = "HIGH" if in_zone else "MEDIUM"
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10001}",
                        "severity": sev,
                        "event_type": "LOITERING",
                        "title": f"PROLONGED PRESENCE / LOITERING: {tid} ({dwell:.0f}s)",
                        "camera": cam_id,
                        "sector": "BORDER ZONE A (Sector Alpha)",
                        "targetId": tid,
                        "confidence": int(conf),
                        "timestamp": time_str,
                        "status": "ACTIVE",
                        "description": f"Target {tid} dwell time ({dwell:.0f}s) exceeded threshold in monitored zone.",
                        "risk_score": min(100, target_threat),
                        "contributing_signals": signals,
                        "reasons": [f"{idx+1}. {r}" for idx, r in enumerate(reasons)],
                        "explainability": {
                            "what": f"Prolonged stationary/loitering presence ({dwell:.0f}s)",
                            "where": f"{cam_id} / BORDER ZONE A",
                            "when": time_str,
                            "object": f"{cname.title()} {tid}",
                            "why": f"Subject remained in monitored area for {dwell:.0f}s exceeding threshold",
                            "confidence": int(conf),
                        },
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)

                    event_record = {
                        "id": f"EV-{int(now_epoch * 100) % 900000 + 1}",
                        "time": time_str,
                        "camera_id": cam_id,
                        "sector": "Sector Alpha",
                        "type": "LOITERING",
                        "event_type": "LOITERING",
                        "severity": sev,
                        "title": alert_item["title"],
                        "details": alert_item["description"],
                        "track_id": tid,
                        "confidence": conf,
                        "timestamp": now_ts
                    }
                    events.append(event_record)
                    self._persist_event(event_record)
            elif dwell >= 10.0 and not in_zone:
                # LOW severity alert: prolonged presence outside restricted zone
                target_threat += THREAT_WEIGHTS["prolonged_presence"]
                signals.append({"signal": f"Prolonged presence ({dwell:.0f}s)", "points": 12})
                reasons.append(f"Extended corridor presence ({dwell:.0f}s)")
                key = f"PROLONGED:{cam_id}:{tid}"
                if self._can_fire(key, "PROLONGED_PRESENCE"):
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10002}",
                        "severity": "LOW",
                        "event_type": "PROLONGED_PRESENCE",
                        "title": f"PROLONGED PRESENCE: {tid} ({dwell:.0f}s)",
                        "camera": cam_id,
                        "sector": "BORDER ZONE A (Sector Alpha)",
                        "targetId": tid,
                        "confidence": int(conf),
                        "timestamp": time_str,
                        "status": "ACTIVE",
                        "description": f"Subject {tid} monitored in corridor for {dwell:.0f}s.",
                        "risk_score": min(100, target_threat),
                        "explainability": {
                            "what": f"Prolonged corridor presence ({dwell:.0f}s)",
                            "where": f"{cam_id} / BORDER ZONE A",
                            "when": time_str,
                            "object": f"{cname.title()} {tid}",
                            "why": "Continuous observation in border corridor",
                            "confidence": int(conf),
                        },
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)

            if speed > 135:
                target_threat += THREAT_WEIGHTS["abnormal_speed"]
                signals.append({"signal": f"Unusual / rapid movement ({speed:.0f} px/s)", "points": THREAT_WEIGHTS["abnormal_speed"]})
                reasons.append(f"Unusual rapid movement detected ({speed:.0f} px/s toward {direction})")
                key = f"SPEED:{cam_id}:{tid}"
                if self._can_fire(key, "ABNORMAL_MOVEMENT"):
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10003}",
                        "severity": "MEDIUM",
                        "event_type": "UNUSUAL_MOVEMENT",
                        "title": f"UNUSUAL MOVEMENT: {tid} ({direction})",
                        "camera": cam_id,
                        "sector": "BORDER ZONE A (Sector Alpha)",
                        "targetId": tid,
                        "confidence": int(conf),
                        "timestamp": time_str,
                        "status": "ACTIVE",
                        "description": f"Rapid movement ({speed:.0f} px/s) toward {direction}.",
                        "risk_score": min(100, target_threat),
                        "explainability": {
                            "what": f"Unusual rapid movement ({speed:.0f} px/s)",
                            "where": f"{cam_id} / BORDER ZONE A",
                            "when": time_str,
                            "object": f"{cname.title()} {tid}",
                            "why": "High-velocity movement in monitored corridor",
                            "confidence": int(conf),
                        },
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)

            # INFO level event when a new person is first tracked (with 25s cooldown)
            if cat == "person" and not in_zone and dwell < 2.0:
                key = f"INFO_PERSON:{cam_id}:{tid}"
                if self._can_fire(key, "PERSON_DETECTED"):
                    alerts.append({
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10004}",
                        "severity": "INFO",
                        "event_type": "PERSON_DETECTED",
                        "title": f"PERSON DETECTED: {tid} ({activity})",
                        "camera": cam_id,
                        "sector": "BORDER ZONE A (Sector Alpha)",
                        "targetId": tid,
                        "confidence": int(conf),
                        "timestamp": time_str,
                        "status": "ACTIVE",
                        "description": f"Person {tid} detected and tracked in corridor. Activity: {activity}.",
                        "risk_score": target_threat,
                        "explainability": {
                            "what": "Person detected in optical corridor",
                            "where": f"{cam_id} / BORDER ZONE A",
                            "when": time_str,
                            "object": f"Person {tid}",
                            "why": "Routine optical detection and track initialization",
                            "confidence": int(conf),
                        },
                        "is_real_ai": True
                    })

            if target_threat > session_threat:
                session_threat = target_threat
                global_contributing_signals = signals
                global_reasons = reasons

        # ── 2. Evaluate Virtual Fence Crossings ──────────────────────────────
        for fe in fence_events:
            tid = fe.get("track_id", "UNKNOWN")
            key = f"FENCE:{cam_id}:{tid}"
            if self._can_fire(key, "FENCE_CROSSING"):
                session_threat = max(session_threat, 85)
                alert_item = {
                    "id": f"ALT-{int(now_epoch * 10) % 90000 + 10005}",
                    "severity": "CRITICAL",
                    "event_type": "FENCE_CROSSING",
                    "title": f"VIRTUAL FENCE BREACH: {fe.get('fence_name', 'Zero-Line')}",
                    "camera": cam_id,
                    "sector": "BORDER ZONE A (Sector Alpha)",
                    "targetId": tid,
                    "confidence": 94,
                    "timestamp": time_str,
                    "status": "ACTIVE",
                    "description": f"Target {tid} breached virtual zero-line barrier boundary.",
                    "risk_score": 85,
                    "explainability": {
                        "what": "Virtual fence line crossed",
                        "where": f"{cam_id} / Zero-Line BP-44",
                        "when": time_str,
                        "object": f"Target {tid}",
                        "why": "Subject trajectory crossed virtual zero-line boundary",
                        "confidence": 94,
                    },
                    "is_real_ai": True
                }
                alerts.append(alert_item)
                event_rec = {
                    "id": f"EV-{int(now_epoch * 100) % 900000 + 2}",
                    "time": time_str,
                    "camera_id": cam_id,
                    "sector": "Sector Alpha",
                    "type": "VIRTUAL_FENCE_CROSSING",
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

                session_threat = max(session_threat, 75 if istatus == "WATCHLIST" else 15)
                key = f"FACE_MATCH:{cam_id}:{pcode}"
                if self._can_fire(key, "FACE_MATCH"):
                    sev = "HIGH" if istatus == "WATCHLIST" else "INFO"
                    alert_item = {
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10006}",
                        "severity": sev,
                        "event_type": "FACE_MATCH",
                        "title": f"KNOWN WATCHLIST PERSON: {pname} [{pcode}]" if istatus == "WATCHLIST" else f"KNOWN AUTHORIZED PERSON: {pname}",
                        "camera": cam_id,
                        "sector": "BORDER ZONE A (Sector Alpha)",
                        "targetId": pcode,
                        "confidence": int(sim * 100),
                        "timestamp": time_str,
                        "status": "ACTIVE",
                        "description": f"Facial recognition match: {pname} (Code: {pcode}, Sim: {sim*100:.1f}%, Status: {istatus}).",
                        "risk_score": 75 if istatus == "WATCHLIST" else 15,
                        "explainability": {
                            "what": f"Enrolled facial watchlist match ({istatus})",
                            "where": f"{cam_id} / BORDER ZONE A",
                            "when": time_str,
                            "object": f"Known Person: {pname} ({pcode})",
                            "why": f"SFace 128D cosine similarity ({sim*100:.1f}%) matched enrolled record",
                            "confidence": int(sim * 100),
                        },
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)
                    event_rec = {
                        "id": f"EV-{int(now_epoch * 100) % 900000 + 3}",
                        "time": time_str,
                        "camera_id": cam_id,
                        "sector": "Sector Alpha",
                        "type": "FACE_MATCH",
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
                        "id": f"ALT-{int(now_epoch * 10) % 90000 + 10007}",
                        "severity": "INFO",
                        "event_type": "ANPR_DETECTED",
                        "title": f"ANPR LOGGED: {anpr.get('formatted_plate', plate)}",
                        "camera": cam_id,
                        "sector": "BORDER ZONE D (Sector Delta)",
                        "targetId": vtid,
                        "confidence": int(pconf),
                        "timestamp": time_str,
                        "status": "ACTIVE",
                        "description": f"Plate recognized on {vtid}: {plate} (Confidence: {pconf:.1f}%).",
                        "risk_score": 20,
                        "explainability": {
                            "what": f"Vehicle registration plate read: {plate}",
                            "where": f"{cam_id} / Checkpoint Corridor",
                            "when": time_str,
                            "object": f"Vehicle {vtid} ({plate})",
                            "why": "Automated license plate OCR & syntax verification",
                            "confidence": int(pconf),
                        },
                        "is_real_ai": True
                    }
                    alerts.append(alert_item)
                    event_rec = {
                        "id": f"EV-{int(now_epoch * 100) % 900000 + 4}",
                        "time": time_str,
                        "camera_id": cam_id,
                        "sector": "Sector Delta",
                        "type": "ANPR_DETECTED",
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
            "contributing_signals": global_contributing_signals,
            "reasons": [f"{i+1}. {r}" for i, r in enumerate(global_reasons)],
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
