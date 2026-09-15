"""
IBVAP AI Feature Upgrade — Event Engine
Computes threat scores, generates smart alerts with debouncing,
and produces structured event records for the dashboard.
"""

import time
import logging
from typing import Dict, Any, List, Optional
from collections import defaultdict

logger = logging.getLogger("IBVAP.EventEngine")

# Threat score weights
SCORE_WEIGHTS = {
    "person_in_zone": 40,
    "loitering": 25,
    "vehicle_in_zone": 35,
    "multiple_persons_in_zone": 20,   # additional per extra person
    "object_in_hand": 10,
    "high_emotion_threat": 15,
    "camera_offline": 20,
}

# Alert debounce cooldowns (seconds per event key)
ALERT_COOLDOWNS = {
    "PERSON_DETECTED": 10,
    "VEHICLE_DETECTED": 15,
    "ZONE_INTRUSION": 8,
    "LOITERING": 30,
    "OBJECT_DETECTED": 20,
    "PHONE_IN_HAND": 15,
    "MULTIPLE_PERSONS": 20,
    "CAMERA_OFFLINE": 30,
    "AI_DEGRADED": 60,
    "UNUSUAL_MOVEMENT": 20,
}

SEVERITY_THRESHOLDS = {
    "LOW": 0,
    "MEDIUM": 30,
    "HIGH": 55,
    "CRITICAL": 75,
}


def _now_str() -> str:
    t = time.localtime()
    return f"{t.tm_hour:02d}:{t.tm_min:02d}:{t.tm_sec:02d}"


def _score_to_label(score: int) -> str:
    if score >= SEVERITY_THRESHOLDS["CRITICAL"]:
        return "CRITICAL"
    elif score >= SEVERITY_THRESHOLDS["HIGH"]:
        return "HIGH"
    elif score >= SEVERITY_THRESHOLDS["MEDIUM"]:
        return "MEDIUM"
    return "LOW"


class EventEngine:
    """
    Computes threat scores and generates debounced alerts.

    Input: enriched targets from ZoneAnalyzer + object detections
    Output: alerts list, events list, per-target threat scores
    """

    def __init__(self, camera_id: str = "CAM-01"):
        self.camera_id = camera_id
        self._last_alert_time: Dict[str, float] = defaultdict(float)

    def _can_fire(self, event_key: str, cooldown_key: str = "PERSON_DETECTED") -> bool:
        cooldown = ALERT_COOLDOWNS.get(cooldown_key, 10)
        now = time.time()
        if now - self._last_alert_time[event_key] >= cooldown:
            self._last_alert_time[event_key] = now
            return True
        return False

    def _compute_target_threat(
        self,
        target: Dict[str, Any],
        all_targets_in_zone: int,
    ) -> Dict[str, Any]:
        """Compute threat score and reasons for a single target."""
        score = 5  # baseline
        reasons = []

        in_zone = target.get("in_restricted_zone", False)
        loitering = target.get("loitering", False)
        dwell = target.get("dwell_seconds", 0)
        objects_in_hand = target.get("objects_in_hand", [])

        # Emotion threat (from face pipeline)
        emotion = target.get("emotion", {})
        threat_profile = emotion.get("threat_profile", {})
        if threat_profile.get("is_threat", False):
            score += SCORE_WEIGHTS["high_emotion_threat"]
            reasons.append(f"Emotion: {emotion.get('primary_expression', 'Unknown')}")

        if in_zone:
            score += SCORE_WEIGHTS["person_in_zone"]
            reasons.append("Restricted zone intrusion")

            if all_targets_in_zone > 1:
                score += SCORE_WEIGHTS["multiple_persons_in_zone"] * (all_targets_in_zone - 1)
                reasons.append(f"Multiple persons in zone ({all_targets_in_zone})")

        if loitering:
            score += SCORE_WEIGHTS["loitering"]
            reasons.append(f"Extended dwell time ({dwell:.0f}s)")

        if objects_in_hand:
            score += SCORE_WEIGHTS["object_in_hand"]
            obj_names = ", ".join(o.get("class_name", "object") for o in objects_in_hand)
            reasons.append(f"Object in hand: {obj_names}")

        score = min(100, max(0, score))
        return {
            "score": score,
            "label": _score_to_label(score),
            "reasons": reasons,
        }

    def process(
        self,
        enriched_targets: List[Dict[str, Any]],
        object_detections: List[Dict[str, Any]],
        frame_size: Dict[str, int],
    ) -> Dict[str, Any]:
        """
        Main processing method. Returns:
        {
          "alerts": [...alert dicts...],
          "events": [...event dicts...],
          "targets_scored": [...targets with threat info...],
          "session_threat_score": int,
          "persons_count": int,
          "vehicles_count": int,
          "objects_count": int,
          "zone_intrusions": int,
          "loitering_count": int,
        }
        """
        now = time.time()
        alerts = []
        events = []

        persons = [t for t in enriched_targets if t.get("target_type", "person") == "person"
                   or "LOC_" in t.get("target_id", "") or "PERSON" in t.get("target_id", "")]
        vehicles_detected = [d for d in object_detections if d.get("category") == "vehicle"]
        objects_detected = [d for d in object_detections if d.get("category") == "object"]

        # Count persons in zone
        persons_in_zone = [t for t in enriched_targets if t.get("in_restricted_zone", False)]
        zone_intrusion_count = len(persons_in_zone)
        loitering_count = sum(1 for t in enriched_targets if t.get("loitering", False))

        targets_scored = []
        session_max_score = 0

        for target in enriched_targets:
            threat = self._compute_target_threat(target, zone_intrusion_count)
            if threat["score"] > session_max_score:
                session_max_score = threat["score"]

            scored_target = {**target, "threat": threat}
            targets_scored.append(scored_target)

            tid = target.get("target_id", "UNKNOWN")
            zone_event = target.get("zone_event")

            # Zone intrusion alert
            if zone_event == "LOITERING":
                key = f"LOITERING:{tid}"
                if self._can_fire(key, "LOITERING"):
                    dwell = target.get("dwell_seconds", 0)
                    zone = target.get("zone_name", "RESTRICTED ZONE")
                    a = self._make_alert(
                        event_type="LOITERING",
                        severity="HIGH",
                        title=f"LOITERING DETECTED — {zone}",
                        description=f"Target {tid} has remained in restricted zone for {dwell:.0f}s",
                        target_id=tid,
                        confidence=85,
                    )
                    alerts.append(a)
                    events.append(self._make_event(
                        event_type="LOITERING",
                        severity="HIGH",
                        title=f"Loitering: {tid} in {zone}",
                        details=f"Dwell time: {dwell:.0f}s | Movement: {target.get('movement','?')}",
                        target_id=tid,
                        confidence=85,
                    ))

            elif zone_event == "INTRUSION":
                key = f"INTRUSION:{tid}"
                if self._can_fire(key, "ZONE_INTRUSION"):
                    zone = target.get("zone_name", "RESTRICTED ZONE")
                    a = self._make_alert(
                        event_type="ZONE_INTRUSION",
                        severity="CRITICAL",
                        title=f"⚠ INTRUSION DETECTED — {zone}",
                        description=f"Target {tid} entered restricted zone. Movement: {target.get('movement','?')}",
                        target_id=tid,
                        confidence=93,
                    )
                    alerts.append(a)
                    events.append(self._make_event(
                        event_type="ZONE_INTRUSION",
                        severity="CRITICAL",
                        title=f"Restricted zone intrusion: {tid}",
                        details=f"Zone: {zone} | Direction: {target.get('direction','?')}",
                        target_id=tid,
                        confidence=93,
                    ))

        # Person detected alert
        if len(enriched_targets) > 0:
            key = f"PERSON_DETECTED:{self.camera_id}"
            if self._can_fire(key, "PERSON_DETECTED"):
                a = self._make_alert(
                    event_type="PERSON_DETECTED",
                    severity="MEDIUM" if zone_intrusion_count == 0 else "HIGH",
                    title=f"PERSON DETECTED — {len(enriched_targets)} target(s)",
                    description=f"{len(enriched_targets)} person(s) tracked on {self.camera_id}",
                    target_id=enriched_targets[0].get("target_id", "?"),
                    confidence=int(enriched_targets[0].get("detection_confidence", 85)),
                )
                alerts.append(a)

        # Vehicle detected alert
        if vehicles_detected:
            key = f"VEHICLE_DETECTED:{self.camera_id}"
            if self._can_fire(key, "VEHICLE_DETECTED"):
                vtype = vehicles_detected[0].get("class_name", "VEHICLE").upper()
                a = self._make_alert(
                    event_type="VEHICLE_DETECTED",
                    severity="MEDIUM",
                    title=f"VEHICLE DETECTED — {vtype}",
                    description=f"{len(vehicles_detected)} vehicle(s) detected on {self.camera_id}",
                    target_id=f"VEH_{vtype[:3]}",
                    confidence=int(vehicles_detected[0].get("confidence", 80)),
                )
                alerts.append(a)
                events.append(self._make_event(
                    event_type="VEHICLE_DETECTED",
                    severity="MEDIUM",
                    title=f"Vehicle: {vtype}",
                    details=f"Conf: {vehicles_detected[0].get('confidence', 80):.0f}% | Cam: {self.camera_id}",
                    target_id=f"VEH_{vtype[:3]}",
                    confidence=int(vehicles_detected[0].get("confidence", 80)),
                ))

        # Object detected alert
        if objects_detected:
            key = f"OBJECT_DETECTED:{self.camera_id}"
            if self._can_fire(key, "OBJECT_DETECTED"):
                oname = objects_detected[0].get("class_name", "OBJECT").upper()
                a = self._make_alert(
                    event_type="OBJECT_DETECTED",
                    severity="LOW",
                    title=f"OBJECT DETECTED — {oname}",
                    description=f"Surveillance object detected on {self.camera_id}",
                    target_id="OBJ",
                    confidence=int(objects_detected[0].get("confidence", 70)),
                )
                alerts.append(a)

        # Multiple persons alert
        if len(enriched_targets) >= 3:
            key = f"MULTIPLE_PERSONS:{self.camera_id}"
            if self._can_fire(key, "MULTIPLE_PERSONS"):
                a = self._make_alert(
                    event_type="MULTIPLE_PERSONS",
                    severity="HIGH",
                    title=f"MULTIPLE PERSONS DETECTED ({len(enriched_targets)})",
                    description=f"{len(enriched_targets)} persons simultaneously tracked on {self.camera_id}",
                    target_id="MULTI",
                    confidence=90,
                )
                alerts.append(a)

        return {
            "alerts": alerts,
            "events": events,
            "targets_scored": targets_scored,
            "session_threat_score": session_max_score,
            "persons_count": len(enriched_targets),
            "vehicles_count": len(vehicles_detected),
            "objects_count": len(objects_detected),
            "zone_intrusions": zone_intrusion_count,
            "loitering_count": loitering_count,
        }

    def _make_alert(
        self,
        event_type: str,
        severity: str,
        title: str,
        description: str,
        target_id: str,
        confidence: int,
    ) -> Dict[str, Any]:
        import random
        return {
            "id": f"AI-{int(time.time() * 1000) % 100000}",
            "event_type": event_type,
            "severity": severity,
            "title": title,
            "description": description,
            "targetId": target_id,
            "confidence": confidence,
            "timestamp": _now_str(),
            "camera": self.camera_id,
            "sector": "Sector Alpha",
            "status": "ACTIVE",
            "source": "AI_ENGINE",
        }

    def _make_event(
        self,
        event_type: str,
        severity: str,
        title: str,
        details: str,
        target_id: str,
        confidence: int,
    ) -> Dict[str, Any]:
        return {
            "id": f"EV-AI-{int(time.time() * 1000) % 100000}",
            "time": _now_str(),
            "type": event_type,
            "severity": severity,
            "title": title,
            "sector": "Sector Alpha",
            "details": details,
            "targetId": target_id,
            "confidence": confidence,
            "camera": self.camera_id,
            "source": "AI_ENGINE",
        }
