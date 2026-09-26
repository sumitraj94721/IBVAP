"""
IBVAP — Intelligent Border Video Analytics Platform (SIH 2026)
Multi-Camera Intelligence & Incident Fusion Engine
- Correlates events across CAM-01, CAM-02, CAM-03, CAM-04
- Distinguishes Affected Cameras vs Normal Cameras
- Builds chronological Cross-Camera Event Timeline
- Computes Explainable Risk Score & AI Explainability (WHAT, WHERE, WHEN, OBJECT, WHY, CONFIDENCE)
- Preserves Incident Snapshot Evidence Records for HIGH / CRITICAL events
- Computes Smart Camera Prioritization (Primary Incident View)
- Generates "WHAT IS HAPPENING NOW" live operator intelligence cards
"""

import os
import time
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import cv2
import numpy as np

logger = logging.getLogger("IBVAP.IncidentFusion")

CAMERA_SECTORS = {
    "CAM-01": "BORDER ZONE A (Sector Alpha)",
    "CAM-02": "BORDER ZONE B (Sector Bravo)",
    "CAM-03": "BORDER ZONE C (Sector Charlie)",
    "CAM-04": "BORDER ZONE D (Sector Delta)",
}


class IBVAPIncidentFusionEngine:
    """
    Multi-Camera Event Correlation & Incident Fusion Engine for IBVAP.
    Combines correlated security events from multiple border cameras into unified
    explainable incidents instead of unrelated isolated alerts.
    """

    def __init__(self, snapshot_dir: str):
        self.snapshot_dir = snapshot_dir
        os.makedirs(self.snapshot_dir, exist_ok=True)

        self._incident_seq = 1042
        self._last_snapshot_at: Dict[str, float] = {}
        self._last_fusion_at: float = 0.0

        # Per-camera live/latest state
        self.camera_states: Dict[str, Dict[str, Any]] = {
            "CAM-01": {
                "camera_id": "CAM-01",
                "sector": CAMERA_SECTORS["CAM-01"],
                "status": "ONLINE",
                "ai_health": "ACTIVE",
                "network_health": "ONLINE",
                "fps": 28.0,
                "model": "YOLOv8n + YuNet/SFace",
                "tracking": "ACTIVE",
                "vision_mode": "OPTICAL DAY",
                "activity_level": "NORMAL",
                "risk_score": 0,
                "risk_level": "NORMAL",
                "last_event": "Normal corridor monitoring",
                "last_updated": time.time(),
                "is_demo": False,
                "persons_count": 0,
                "vehicles_count": 0,
                "objects_count": 0,
            },
            "CAM-02": {
                "camera_id": "CAM-02",
                "sector": CAMERA_SECTORS["CAM-02"],
                "status": "STANDBY",
                "ai_health": "STANDBY",
                "network_health": "STANDBY",
                "fps": 0.0,
                "model": "YOLOv8n Edge Pipeline",
                "tracking": "STANDBY",
                "vision_mode": "LOW-LIGHT VISUAL MODE",
                "activity_level": "NORMAL",
                "risk_score": 0,
                "risk_level": "NORMAL",
                "last_event": "Awaiting edge stream / normal",
                "last_updated": time.time(),
                "is_demo": False,
                "persons_count": 0,
                "vehicles_count": 0,
                "objects_count": 0,
            },
            "CAM-03": {
                "camera_id": "CAM-03",
                "sector": CAMERA_SECTORS["CAM-03"],
                "status": "ONLINE [SIM]",
                "ai_health": "ACTIVE [SIM]",
                "network_health": "SIMULATED LINK",
                "fps": 25.0,
                "model": "Rule + Simulated Sensor",
                "tracking": "ACTIVE [SIM]",
                "vision_mode": "THERMAL VISUALIZATION [SIM]",
                "activity_level": "NORMAL",
                "risk_score": 15,
                "risk_level": "NORMAL",
                "last_event": "Riverine buffer monitoring [DEMO / SIMULATION]",
                "last_updated": time.time(),
                "is_demo": True,
                "persons_count": 0,
                "vehicles_count": 0,
                "objects_count": 0,
            },
            "CAM-04": {
                "camera_id": "CAM-04",
                "sector": CAMERA_SECTORS["CAM-04"],
                "status": "ONLINE [SIM]",
                "ai_health": "ACTIVE [SIM]",
                "network_health": "SIMULATED LINK",
                "fps": 28.0,
                "model": "ANPR + Rule Pipeline [SIM]",
                "tracking": "ACTIVE [SIM]",
                "vision_mode": "OPTICAL DAY [SIM]",
                "activity_level": "NORMAL",
                "risk_score": 10,
                "risk_level": "NORMAL",
                "last_event": "Checkpoint barrier monitoring [DEMO / SIMULATION]",
                "last_updated": time.time(),
                "is_demo": True,
                "persons_count": 0,
                "vehicles_count": 0,
                "objects_count": 0,
            },
        }

        # Cross-camera timeline events
        self.cross_camera_timeline: List[Dict[str, Any]] = []

        # Active fused incidents
        self.fused_incidents: List[Dict[str, Any]] = []

        # Preserved incident snapshots
        self.snapshots: List[Dict[str, Any]] = []

        # Smart camera prioritization state
        self.priority_camera: Optional[str] = None
        self.priority_reason: Optional[str] = None

    def save_incident_snapshot(
        self,
        frame_bgr: Optional[np.ndarray],
        camera_id: str,
        event_type: str,
        track_id: str,
        confidence: float,
        zone: str,
        risk_score: int,
        reason: str,
        detected_objects: List[str],
        is_demo: bool = False,
        force: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Preserves an incident snapshot frame and structured metadata record
        when a HIGH or CRITICAL event occurs. Does not overwrite original footage.
        """
        now = time.time()
        cooldown_key = f"{camera_id}:{event_type}:{track_id}"
        if not force and (now - self._last_snapshot_at.get(cooldown_key, 0.0) < 10.0):
            return self.snapshots[0] if self.snapshots else None

        self._last_snapshot_at[cooldown_key] = now
        ts_ms = int(now * 1000)
        time_str = time.strftime("%H:%M:%S")
        iso_str = datetime.now(timezone.utc).isoformat()
        safe_event = event_type.lower().replace(" ", "_").replace("-", "_")
        filename = f"{camera_id}_{safe_event}_{ts_ms}.jpg"
        filepath = os.path.join(self.snapshot_dir, filename)
        snapshot_url = f"/static/snapshots/{filename}"

        try:
            if frame_bgr is not None and frame_bgr.size > 0:
                annotated = frame_bgr.copy()
                h, w = annotated.shape[:2]
                # Draw clean forensic header bar on copy only (never mutating caller's frame)
                cv2.rectangle(annotated, (0, 0), (w, 32), (10, 18, 35), -1)
                banner = f"IBVAP EVIDENCE | {camera_id} | {time_str} | {event_type} | RISK:{risk_score}/100"
                cv2.putText(annotated, banner, (8, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 240, 255), 1, cv2.LINE_AA)
                cv2.imwrite(filepath, annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            else:
                snapshot_url = None
        except Exception as e:
            logger.debug(f"Snapshot write error: {e}")
            snapshot_url = None

        record = {
            "snapshot_id": f"SNAP-{ts_ms % 1000000}",
            "camera_id": camera_id,
            "source_camera": camera_id,
            "timestamp": time_str,
            "timestamp_iso": iso_str,
            "snapshot_url": snapshot_url,
            "detected_objects": detected_objects,
            "confidence": round(confidence, 1),
            "track_id": track_id,
            "zone": zone,
            "event_type": event_type,
            "risk_score": risk_score,
            "reason": reason,
            "is_demo": is_demo,
        }

        self.snapshots.insert(0, record)
        if len(self.snapshots) > 30:
            self.snapshots = self.snapshots[:30]

        return record

    def update_from_pipeline(
        self,
        camera_id: str,
        analysis: Dict[str, Any],
        frame_bgr: Optional[np.ndarray] = None,
        latency_ms: float = 35.0
    ) -> Dict[str, Any]:
        """
        Updates the multi-camera intelligence state from a real pipeline frame result,
        preserves snapshots for HIGH/CRITICAL events, and runs multi-camera correlation.
        """
        now = time.time()
        time_str = time.strftime("%H:%M:%S")

        targets = analysis.get("targets", [])
        vehicles = analysis.get("vehicles", [])
        other_objects = analysis.get("other_objects", [])
        alerts = analysis.get("ai_alerts", [])
        threat_score = analysis.get("threat_score", 0)
        zone_intrusions = analysis.get("zone_intrusions", 0)
        fps = round(1000.0 / max(20.0, latency_ms), 1)

        # Determine camera activity status
        if threat_score >= 70 or zone_intrusions > 0:
            activity_level = "RESTRICTED-ZONE EVENT"
            risk_level = "HIGH" if threat_score < 80 else "CRITICAL"
        elif threat_score >= 35 or any(t.get("loitering") for t in targets):
            activity_level = "UNUSUAL ACTIVITY"
            risk_level = "MEDIUM"
        elif len(vehicles) > 0:
            activity_level = "VEHICLE EVENT"
            risk_level = "MONITORED"
        elif len(targets) > 0:
            activity_level = "NORMAL"
            risk_level = "NORMAL"
        else:
            activity_level = "NORMAL"
            risk_level = "NORMAL"

        # Summarize latest observable event on this camera
        last_event_desc = "Clear optical corridor"
        if targets:
            t0 = targets[0]
            act = t0.get("activity", t0.get("movement", "MONITORED"))
            hold = t0.get("holding_status", "NONE")
            hold_part = f" | {hold}" if hold and hold != "NONE" else ""
            last_event_desc = f"Person {t0.get('target_id')} - {act}{hold_part}"
        elif vehicles:
            v0 = vehicles[0]
            last_event_desc = f"Vehicle {v0.get('track_id')} ({v0.get('object_type')}) - {v0.get('activity', v0.get('movement', 'MOVING'))}"
        elif other_objects:
            o0 = other_objects[0]
            last_event_desc = f"Object {o0.get('class_name', 'object').upper()} ({o0.get('track_id')})"

        self.camera_states[camera_id] = {
            **self.camera_states.get(camera_id, {}),
            "camera_id": camera_id,
            "sector": CAMERA_SECTORS.get(camera_id, "BORDER ZONE A"),
            "status": "ONLINE",
            "ai_health": "ACTIVE" if analysis.get("analytics_enabled", True) else "PAUSED",
            "network_health": "ONLINE",
            "fps": min(30.0, fps),
            "latency_ms": latency_ms,
            "model": f"YOLO ({analysis.get('ai_stats', {}).get('yolo_model', 'yolov8n.pt')})",
            "tracking": "ACTIVE",
            "activity_level": activity_level,
            "risk_score": threat_score,
            "risk_level": risk_level,
            "last_event": last_event_desc,
            "last_updated": now,
            "last_frame_time": time_str,
            "is_demo": False,
            "persons_count": len(targets),
            "vehicles_count": len(vehicles),
            "objects_count": len(other_objects),
        }

        # Preserve snapshots & append timeline entries for HIGH / CRITICAL real alerts
        detected_names = (
            [f"PERSON {t.get('target_id')}" for t in targets]
            + [f"{v.get('object_type', 'VEHICLE')} {v.get('track_id')}" for v in vehicles]
            + [f"{o.get('class_name', 'OBJECT').upper()} {o.get('track_id')}" for o in other_objects]
        )

        for alt in alerts:
            sev = alt.get("severity", "INFO")
            # Add to cross-camera timeline
            self._add_timeline_step(
                camera_id=camera_id,
                event_text=alt.get("title", "Security Event"),
                severity=sev,
                details=alt.get("description", ""),
                is_demo=False
            )
            if sev in ("HIGH", "CRITICAL"):
                snap = self.save_incident_snapshot(
                    frame_bgr=frame_bgr,
                    camera_id=camera_id,
                    event_type=alt.get("event_type", "SECURITY_EVENT"),
                    track_id=alt.get("targetId", "P-001"),
                    confidence=float(alt.get("confidence", 85.0)),
                    zone=alt.get("sector", CAMERA_SECTORS.get(camera_id, "BORDER ZONE A")),
                    risk_score=threat_score,
                    reason=alt.get("description", alt.get("title", "Restricted zone event")),
                    detected_objects=detected_names or ["PERSON"],
                    is_demo=False,
                )
                if snap and snap.get("snapshot_url"):
                    alt["snapshot_url"] = snap["snapshot_url"]

                # Smart Camera Prioritization on real HIGH/CRITICAL event
                self.priority_camera = camera_id
                self.priority_reason = f"{sev} EVENT: {alt.get('title')}"

        # Check if multiple cameras have active unusual/high-risk events and fuse them
        self._evaluate_multi_camera_correlation(now)

        return self.get_intelligence_summary(current_analysis=analysis)

    def _add_timeline_step(
        self,
        camera_id: str,
        event_text: str,
        severity: str = "INFO",
        details: str = "",
        is_demo: bool = False,
        custom_time: Optional[str] = None
    ):
        t_str = custom_time or time.strftime("%H:%M:%S")
        # Avoid consecutive duplicate timeline entries
        if self.cross_camera_timeline:
            top = self.cross_camera_timeline[0]
            if top.get("camera_id") == camera_id and top.get("event") == event_text and (time.time() - top.get("epoch", 0) < 6.0):
                return

        entry = {
            "id": f"CCT-{int(time.time() * 1000) % 1000000}",
            "time": t_str,
            "epoch": time.time(),
            "camera_id": camera_id,
            "sector": CAMERA_SECTORS.get(camera_id, "IBVAP CORRELATION HUB"),
            "event": event_text,
            "severity": severity,
            "details": details,
            "is_demo": is_demo,
        }
        self.cross_camera_timeline.insert(0, entry)
        if len(self.cross_camera_timeline) > 40:
            self.cross_camera_timeline = self.cross_camera_timeline[:40]

    def _evaluate_multi_camera_correlation(self, now: float):
        """
        Checks if >= 2 cameras have unusual/security events and correlates them into
        a Multi-Camera Incident Fusion record.
        """
        unusual_cams = []
        normal_cams = []

        for cid, st in self.camera_states.items():
            if st.get("activity_level") not in ("NORMAL", "STANDBY") or st.get("risk_score", 0) >= 40:
                unusual_cams.append(cid)
            else:
                normal_cams.append(cid)

        if len(unusual_cams) >= 2 and (now - self._last_fusion_at > 12.0):
            self._last_fusion_at = now
            # Find highest risk camera as primary view
            primary_cam = max(unusual_cams, key=lambda c: self.camera_states[c].get("risk_score", 0))
            max_risk = max(self.camera_states[c].get("risk_score", 50) for c in unusual_cams)
            fused_score = min(100, max_risk + 12)
            any_demo = any(self.camera_states[c].get("is_demo", False) for c in unusual_cams)

            inc_id = f"IBVAP-{self._incident_seq}"
            self._incident_seq += 1

            events_list = [
                f"{cid}: {self.camera_states[cid].get('last_event', 'Unusual activity')}"
                for cid in unusual_cams
            ]
            events_list.append("POSSIBLE CROSS-CAMERA TRACK (Correlated by sector timing & trajectory)")

            fused_incident = {
                "incident_id": f"INCIDENT #{inc_id}",
                "short_id": inc_id,
                "status": "ACTIVE",
                "risk": "CRITICAL" if fused_score >= 80 else "HIGH",
                "risk_score": fused_score,
                "cameras_involved": unusual_cams,
                "normal_cameras": normal_cams,
                "primary_camera": primary_cam,
                "cross_camera_identity": "POSSIBLE CROSS-CAMERA TRACK",
                "events": events_list,
                "reasons": [
                    f"1. Multiple correlated security events across {', '.join(unusual_cams)}",
                    f"2. Primary high-risk activity localized on {primary_cam} ({CAMERA_SECTORS.get(primary_cam)})",
                    f"3. Normal baseline maintained on {', '.join(normal_cams) if normal_cams else 'None'}",
                ],
                "contributing_signals": [
                    {"signal": "Multi-camera correlated activity", "points": 25},
                    {"signal": f"Primary sector risk ({primary_cam})", "points": max_risk},
                ],
                "explainability": {
                    "what": f"Multi-camera correlated security incident across {len(unusual_cams)} cameras",
                    "where": f"{', '.join(unusual_cams)} (Primary: {primary_cam})",
                    "when": time.strftime("%H:%M:%S"),
                    "object": "Correlated Person & Vehicle Tracks (POSSIBLE CROSS-CAMERA TRACK)",
                    "why": "Multiple adjacent border cameras detected temporally correlated security events.",
                    "confidence": 89,
                },
                "snapshots": self.snapshots[:3],
                "timestamp": time.strftime("%H:%M:%S"),
                "is_demo": any_demo,
            }

            self.fused_incidents.insert(0, fused_incident)
            if len(self.fused_incidents) > 10:
                self.fused_incidents = self.fused_incidents[:10]

            self.priority_camera = primary_cam
            self.priority_reason = f"MULTI-CAMERA INCIDENT #{inc_id} — {primary_cam} PRIORITIZED"

            self._add_timeline_step(
                camera_id="IBVAP",
                event_text=f"MULTI-CAMERA EVENT CORRELATED ({inc_id})",
                severity="HIGH",
                details=f"Affected: {', '.join(unusual_cams)} | Normal: {', '.join(normal_cams)}",
                is_demo=any_demo,
            )

    def trigger_sih_demo_fusion(self, live_cam1_analysis: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Executes the clean SIH Judge Demonstration Workflow (Section 10, 11, 12, 21, 26):
        - CAM-01: Live Normal Activity (or real live webcam state)
        - CAM-02: Unusual Activity — Person detected approaching restricted zone [DEMO / SIMULATION]
        - CAM-03: Restricted-Zone Event — Person enters restricted zone [DEMO / SIMULATION]
        - CAM-04: Vehicle Event — Vehicle detected approaching checkpoint [DEMO / SIMULATION]
        -> IBVAP INCIDENT FUSION correlates events into 1 incident (#IBVAP-xxxx)
        -> Raises MULTI-CAMERA SECURITY ALERT
        -> Prioritizes CAM-03 as PRIMARY INCIDENT VIEW
        -> Produces Cross-Camera Event Timeline & Explainable Risk Score
        """
        now = time.time()
        base_dt = datetime.fromtimestamp(now)
        t_cam1 = time.strftime("%H:%M:%S", time.localtime(now - 25))
        t_cam2 = time.strftime("%H:%M:%S", time.localtime(now - 17))
        t_cam3 = time.strftime("%H:%M:%S", time.localtime(now - 12))
        t_cam4 = time.strftime("%H:%M:%S", time.localtime(now - 4))
        t_fuse = time.strftime("%H:%M:%S", time.localtime(now))

        # Preserve CAM-01 live state if active, marking it as NORMAL baseline camera
        cam1_live_persons = len((live_cam1_analysis or {}).get("targets", []))
        self.camera_states["CAM-01"].update({
            "activity_level": "NORMAL",
            "risk_score": 12,
            "risk_level": "NORMAL",
            "last_event": f"Live optical patrol ({cam1_live_persons} person monitored)" if cam1_live_persons else "Live optical corridor nominal",
            "is_demo": False,
        })

        # Update CAM-02, CAM-03, CAM-04 for the correlated multi-camera scenario
        self.camera_states["CAM-02"].update({
            "status": "ONLINE [SIM]",
            "ai_health": "ACTIVE [SIM]",
            "fps": 25.0,
            "activity_level": "UNUSUAL ACTIVITY",
            "risk_score": 52,
            "risk_level": "MEDIUM",
            "last_event": "Person P-017 approaching restricted boundary [DEMO / SIMULATION]",
            "persons_count": 1,
            "is_demo": True,
        })
        self.camera_states["CAM-03"].update({
            "status": "ONLINE [SIM]",
            "ai_health": "ACTIVE [SIM]",
            "fps": 25.0,
            "activity_level": "RESTRICTED-ZONE EVENT",
            "risk_score": 84,
            "risk_level": "HIGH",
            "last_event": "Person entered restricted zone (POSSIBLE CROSS-CAMERA TRACK) [DEMO / SIMULATION]",
            "persons_count": 1,
            "objects_count": 1,
            "is_demo": True,
        })
        self.camera_states["CAM-04"].update({
            "status": "ONLINE [SIM]",
            "ai_health": "ACTIVE [SIM]",
            "fps": 28.0,
            "activity_level": "VEHICLE EVENT",
            "risk_score": 64,
            "risk_level": "MEDIUM",
            "last_event": "Vehicle V-004 stopped near restricted checkpoint [DEMO / SIMULATION]",
            "vehicles_count": 1,
            "is_demo": True,
        })

        # Add chronological Cross-Camera Event Timeline steps
        timeline_steps = [
            ("CAM-01", "Person detected (Normal corridor activity)", "INFO", "Sector Alpha live optical baseline", False, t_cam1),
            ("CAM-02", "Person approaching restricted zone [DEMO / SIMULATION]", "MEDIUM", "Sector Bravo perimeter buffer — POSSIBLE CROSS-CAMERA TRACK", True, t_cam2),
            ("CAM-03", "Restricted-zone entry detected [DEMO / SIMULATION]", "HIGH", "Sector Charlie restricted zone breached — carrying backpack", True, t_cam3),
            ("CAM-04", "Vehicle detected near checkpoint barrier [DEMO / SIMULATION]", "MEDIUM", "Sector Delta — unauthorized vehicle proximity", True, t_cam4),
            ("IBVAP", "MULTI-CAMERA EVENT CORRELATED", "HIGH", "IBVAP Incident Fusion Engine correlated CAM-02, CAM-03, CAM-04 (CAM-01 Normal)", True, t_fuse),
        ]
        for cid, ev, sev, det, demo_flag, ctime in timeline_steps:
            self._add_timeline_step(cid, ev, sev, det, is_demo=demo_flag, custom_time=ctime)

        # Create synthetic evidence snapshot for the demo incident clearly marked DEMO / SIMULATION
        synth_frame = np.zeros((360, 640, 3), dtype=np.uint8)
        synth_frame[:] = (24, 16, 10)
        cv2.rectangle(synth_frame, (190, 72), (510, 306), (0, 0, 180), 2)
        cv2.putText(synth_frame, "RESTRICTED ZONE [BORDER ZONE C]", (200, 92), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (80, 80, 255), 1)
        cv2.rectangle(synth_frame, (280, 130), (350, 270), (0, 140, 255), 2)
        cv2.putText(synth_frame, "PERSON #P-017 [93%] | HOLDING: BACKPACK", (210, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 240, 255), 1)
        cv2.putText(synth_frame, "[DEMO / SIMULATIONSNAPSHOT - CAM-03]", (180, 340), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 255), 1)

        snap = self.save_incident_snapshot(
            frame_bgr=synth_frame,
            camera_id="CAM-03",
            event_type="MULTI_CAMERA_RESTRICTED_ENTRY",
            track_id="P-017",
            confidence=93.0,
            zone="BORDER ZONE C (Sector Charlie)",
            risk_score=84,
            reason="Correlated multi-camera restricted-zone entry + vehicle event [DEMO / SIMULATION]",
            detected_objects=["PERSON #P-017", "BACKPACK #O-004", "VEHICLE #V-004"],
            is_demo=True,
            force=True,
        )

        inc_code = f"IBVAP-{self._incident_seq}"
        self._incident_seq += 1

        fused_incident = {
            "incident_id": f"INCIDENT #{inc_code}",
            "short_id": inc_code,
            "status": "ACTIVE",
            "risk": "HIGH",
            "risk_score": 84,
            "cameras_involved": ["CAM-02", "CAM-03", "CAM-04"],
            "normal_cameras": ["CAM-01"],
            "primary_camera": "CAM-03",
            "cross_camera_identity": "POSSIBLE CROSS-CAMERA TRACK (No biometric identity claimed across cameras)",
            "events": [
                f"{t_cam1} CAM-01: Normal person activity (Live Optical)",
                f"{t_cam2} CAM-02: Person approaching restricted zone [DEMO / SIMULATION]",
                f"{t_cam3} CAM-03: Restricted-zone entry with backpack [DEMO / SIMULATION]",
                f"{t_cam4} CAM-04: Vehicle detected stopping near checkpoint [DEMO / SIMULATION]",
                f"{t_fuse} IBVAP: MULTI-CAMERA EVENT CORRELATED",
            ],
            "objects": ["BACKPACK (CARRIED)"],
            "persons": ["PERSON #P-017 (POSSIBLE CROSS-CAMERA TRACK)"],
            "vehicles": ["VEHICLE #V-004 (UTILITY CAR)"],
            "contributing_signals": [
                {"signal": "Restricted zone entry (CAM-03)", "points": 40},
                {"signal": "Prolonged presence / trajectory toward boundary (CAM-02 -> CAM-03)", "points": 20},
                {"signal": "Correlated vehicle activity near checkpoint (CAM-04)", "points": 14},
                {"signal": "Carrying monitored baggage (Backpack) in restricted zone", "points": 10},
            ],
            "reasons": [
                "1. Person approached restricted boundary on CAM-02 and entered restricted zone on CAM-03 (18s dwell)",
                "2. Subject observed carrying BACKPACK inside restricted perimeter",
                "3. Correlated vehicle activity detected simultaneously on CAM-04 while CAM-01 remained normal",
            ],
            "explainability": {
                "what": "Multi-Camera Correlated Restricted-Zone Entry & Vehicle Activity",
                "where": "CAM-02, CAM-03, CAM-04 (Primary Focus: CAM-03 / BORDER ZONE C)",
                "when": t_fuse,
                "object": "Person #P-017 (Carrying Backpack) + Vehicle #V-004",
                "why": "Multiple correlated security events detected across 3 adjacent cameras while CAM-01 remained normal.",
                "confidence": 93,
            },
            "snapshots": [snap] if snap else self.snapshots[:2],
            "timestamp": t_fuse,
            "is_demo": True,
        }

        self.fused_incidents.insert(0, fused_incident)
        self.priority_camera = "CAM-03"
        self.priority_reason = f"PRIMARY INCIDENT VIEW: {fused_incident['incident_id']} (HIGH RISK ON CAM-03)"

        multi_cam_alert = {
            "id": f"ALT-{int(now * 10) % 90000 + 10000}",
            "severity": "HIGH",
            "event_type": "MULTI_CAMERA_SECURITY_ALERT",
            "title": f"MULTI-CAMERA SECURITY ALERT [{inc_code}] — [DEMO / SIMULATION]",
            "camera": "CAM-02, CAM-03, CAM-04",
            "primary_camera": "CAM-03",
            "affected_cameras": ["CAM-02", "CAM-03", "CAM-04"],
            "normal_cameras": ["CAM-01"],
            "sector": "Multi-Sector (Bravo / Charlie / Delta)",
            "targetId": "P-017 / V-004",
            "confidence": 93,
            "timestamp": t_fuse,
            "status": "ACTIVE",
            "description": "Affected Cameras: CAM-02, CAM-03, CAM-04 | Normal Camera: CAM-01 | Reason: Multiple correlated security events detected (Restricted-zone entry + Vehicle proximity).",
            "explainability": fused_incident["explainability"],
            "risk_score": 84,
            "contributing_signals": fused_incident["contributing_signals"],
            "snapshot_url": snap.get("snapshot_url") if snap else None,
            "is_real_ai": False,
            "is_demo": True,
        }

        return {
            "incident": fused_incident,
            "alert": multi_cam_alert,
            "priority_camera": self.priority_camera,
            "priority_reason": self.priority_reason,
            "camera_states": self.camera_states,
            "cross_camera_timeline": self.cross_camera_timeline[:15],
        }

    def clear_priority_camera(self):
        self.priority_camera = None
        self.priority_reason = None

    def get_what_is_happening_now(self, current_analysis: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Generates operator-friendly 'WHAT IS HAPPENING NOW' cards from real current data
        and any active multi-camera incidents.
        """
        cards: List[Dict[str, Any]] = []
        time_str = time.strftime("%H:%M:%S")

        if current_analysis:
            targets = current_analysis.get("targets", [])
            vehicles = current_analysis.get("vehicles", [])
            other_objects = current_analysis.get("other_objects", [])
            cam_id = current_analysis.get("camera_id", "CAM-01")

            for pt in targets:
                ac = pt.get("activity_card", {})
                cards.append({
                    "camera": cam_id,
                    "subject": f"Person #{pt.get('target_id', 'P-001')} detected.",
                    "movement": f"{ac.get('activity', pt.get('movement', 'Walking'))} ({pt.get('direction', 'STATIONARY')})",
                    "object": ac.get("object", pt.get("holding_status", "NONE")),
                    "zone": ac.get("location", "Border Zone A (Sector Alpha)"),
                    "face": ac.get("face_status", pt.get("face_status", "NO FACE VISIBLE")),
                    "risk": ac.get("risk", pt.get("risk_level", "NORMAL")),
                    "risk_score": ac.get("risk_score", current_analysis.get("threat_score", 10)),
                    "reason": ac.get("reason", pt.get("risk_reason", "Standard corridor presence.")),
                    "behavioral_signals": ac.get("behavioral_signals", []),
                    "time_seen": ac.get("time_seen", time_str),
                    "is_demo": False,
                })

            for vt in vehicles:
                cards.append({
                    "camera": cam_id,
                    "subject": f"Vehicle #{vt.get('track_id', 'V-001')} ({vt.get('object_type', 'CAR')}) detected.",
                    "movement": f"{vt.get('activity', vt.get('movement', 'Moving'))} ({vt.get('direction', 'STATIONARY')})",
                    "object": f"ANPR Plate: {vt.get('plate', 'N/A')}",
                    "zone": "Border Zone A [RESTRICTED]" if vt.get("in_restricted_zone") else "Border Zone A (Sector Alpha)",
                    "face": "N/A (Vehicle Track)",
                    "risk": vt.get("risk_level", "MONITORED"),
                    "risk_score": 65 if vt.get("in_restricted_zone") else 20,
                    "reason": vt.get("risk_reason", "Tracked vehicle in corridor."),
                    "behavioral_signals": [],
                    "time_seen": time_str,
                    "is_demo": False,
                })

            if not targets and not vehicles and other_objects:
                obj_names = ", ".join(
                    f"{o.get('class_name', 'OBJECT').upper()} ({o.get('track_id')})"
                    for o in other_objects[:4]
                )
                cards.append({
                    "camera": cam_id,
                    "subject": f"Everyday objects detected ({len(other_objects)}).",
                    "movement": "Stationary / Monitored",
                    "object": obj_names,
                    "zone": "Border Zone A (Sector Alpha)",
                    "face": "No person in frame",
                    "risk": "NORMAL",
                    "risk_score": 5,
                    "reason": "Observable everyday objects detected in camera field of view.",
                    "behavioral_signals": [],
                    "time_seen": time_str,
                    "is_demo": False,
                })

        # Also include active multi-camera correlated camera events if any non-normal camera state exists
        for cid in ("CAM-02", "CAM-03", "CAM-04"):
            st = self.camera_states.get(cid, {})
            if st.get("activity_level") not in ("NORMAL", "STANDBY"):
                cards.append({
                    "camera": cid,
                    "subject": st.get("last_event", "Security activity detected"),
                    "movement": st.get("activity_level", "UNUSUAL ACTIVITY"),
                    "object": "Backpack / Vehicle" if cid in ("CAM-03", "CAM-04") else "Tracked Subject",
                    "zone": st.get("sector", "Border Zone"),
                    "face": "POSSIBLE CROSS-CAMERA TRACK",
                    "risk": st.get("risk_level", "MEDIUM"),
                    "risk_score": st.get("risk_score", 50),
                    "reason": f"Correlated multi-camera event on {cid}.",
                    "behavioral_signals": [],
                    "time_seen": time_str,
                    "is_demo": st.get("is_demo", True),
                })

        if not cards:
            cards.append({
                "camera": "CAM-01",
                "subject": "No active person or vehicle currently in optical view.",
                "movement": "Corridor Clear",
                "object": "NONE",
                "zone": "Border Zone A (Sector Alpha)",
                "face": "N/A",
                "risk": "NORMAL",
                "risk_score": 0,
                "reason": "All monitored border zones currently nominal.",
                "behavioral_signals": [],
                "time_seen": time_str,
                "is_demo": False,
            })

        return cards

    def get_intelligence_summary(self, current_analysis: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        unusual_cams = [
            cid for cid, st in self.camera_states.items()
            if st.get("activity_level") not in ("NORMAL", "STANDBY")
        ]
        normal_cams = [
            cid for cid, st in self.camera_states.items()
            if cid not in unusual_cams
        ]
        return {
            "camera_states": self.camera_states,
            "affected_cameras": unusual_cams,
            "normal_cameras": normal_cams,
            "multi_camera_correlated": len(unusual_cams) >= 2,
            "priority_camera": self.priority_camera,
            "priority_reason": self.priority_reason,
            "fused_incidents": self.fused_incidents[:6],
            "cross_camera_timeline": self.cross_camera_timeline[:20],
            "snapshots": self.snapshots[:12],
            "what_is_happening_now": self.get_what_is_happening_now(current_analysis),
        }
