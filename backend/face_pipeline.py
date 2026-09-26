"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Unified Multi-Object Surveillance Vision Pipeline
Connects YOLOv8 Object Detection, Multi-Object Tracking (P-xxx, V-xxx),
YuNet + SFace Face Recognition, Dedicated ANPR, Zone Analysis, and Observable Event Engine.
"""

import os
import time
import logging
from typing import List, Dict, Any, Tuple, Optional

import cv2
import numpy as np

from backend.detection.yolo_detector import YoloDetector
from backend.detection.tracker import MultiObjectTracker
from backend.face.face_detector import YuNetFaceDetector
from backend.face.face_embedding import SFaceFeatureExtractor
from backend.face.face_matcher import FaceMatcher
from backend.anpr.plate_detector import PlateDetector
from backend.anpr.ocr import PlateOCR
from backend.anpr.plate_validator import PlateValidator
from backend.ai.zone_analyzer import ZoneAnalyzer
from backend.events.event_engine import SurveillanceEventEngine
from backend.emotion_pipeline import EmotionClassifier

logger = logging.getLogger("IBVAP.Pipeline")


class SurveillanceVisionPipeline:
    """
    Unified AI Multi-Object Surveillance Video Analytics Pipeline.
    
    Target Pipeline Architecture:
      LIVE CAMERA INGESTION
              ↓
      YOLO OBJECT DETECTION (Ultralytics YOLOv8n)
              ↓
     ┌────────┼────────┐
     ↓        ↓        ↓
   PERSON   VEHICLE   FACE
  TRACKING TRACKING  RECOGNITION
  (P-001)  (V-001)   (SFace 128D)
     ↓        ↓        ↓
     └────────┼────────┘
              ↓
        EVENT ENGINE (Observable CV threats)
              ↓
      ALERT & EVENT LOGGING
              ↓
      RAKSHAN COMMAND CENTER
    """

    def __init__(self, engine: str = "yunet", camera_id: str = "CAM-01"):
        self.camera_id = camera_id
        self.analytics_enabled = True
        self._frame_count = 0

        # 1. Primary Object Detection & Tracking
        self.yolo_detector = YoloDetector(camera_id=camera_id)
        self.tracker = MultiObjectTracker(max_disappeared=25, iou_threshold=0.25)

        # 2. Upgraded Face Pipeline (YuNet + SFace 128D + SQLite Watchlist)
        self.face_detector = YuNetFaceDetector()
        self.face_extractor = SFaceFeatureExtractor()
        self.face_matcher = FaceMatcher()
        # Keep detector reference for backward-compatibility with existing routes
        self.detector = self.face_detector

        # 3. Dedicated ANPR Pipeline
        self.plate_detector = PlateDetector()
        self.plate_ocr = PlateOCR()

        # 4. Observable Computer Vision Zone & Event Engine
        self.zone_analyzer = ZoneAnalyzer()
        self.event_engine = SurveillanceEventEngine(camera_id=camera_id)

        # 5. Optional diagnostic emotion classifier (isolated from primary threat logic)
        self.emotion_classifier = EmotionClassifier()

        # Cached state for performance throttling on CPU
        self._last_yolo_detections: List[Dict[str, Any]] = []
        self._last_face_results: Dict[str, Dict[str, Any]] = {}
        self._last_plate_results: Dict[str, Dict[str, Any]] = {}

        logger.info("[+] SurveillanceVisionPipeline initialized with real multi-object analytics.")

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        confidence_threshold: float = 0.40,
        engine: Optional[str] = None,
        vehicle_detections: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Executes end-to-end multi-object surveillance analysis on a video frame.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return self._empty_result(640, 360)

        h, w = frame_bgr.shape[:2]
        self._frame_count += 1
        t_start = time.time()

        if not self.analytics_enabled:
            return self._empty_result(w, h)

        # ── 1. YOLO Object Detection (Every 1-2 frames for smooth CPU latency) ──
        # On CPU, run YOLO every 2nd frame if latency > 80ms, otherwise every frame
        run_yolo = (self._frame_count % 2 == 0) or (len(self._last_yolo_detections) == 0)
        if run_yolo and self.yolo_detector.is_ready:
            try:
                self._last_yolo_detections = self.yolo_detector.detect(
                    frame_bgr,
                    confidence_threshold=confidence_threshold,
                    camera_id=self.camera_id
                )
            except Exception as e:
                logger.debug(f"YOLO inference error: {e}")

        # ── 2. Multi-Object Tracking (Persons, Vehicles, Objects) ─────────────
        all_tracks = self.tracker.update(self._last_yolo_detections, (h, w), camera_id=self.camera_id)

        # Separate person, vehicle, and general object tracks
        person_tracks = [t for t in all_tracks if t.get("category") == "person"]
        vehicle_tracks = [t for t in all_tracks if t.get("category") == "vehicle"]
        object_tracks = [t for t in all_tracks if t.get("category") not in ("person", "vehicle")]

        # ── 3. Face Recognition on Person Tracks ─────────────────────────────
        # Only run face recognition on detected person crops every 3rd frame
        active_face_matches = []
        enriched_person_targets = []

        for p_trk in person_tracks:
            tid = p_trk["track_id"]
            p_box = p_trk["bbox"]

            # Check if we should re-extract face
            should_detect_face = (self._frame_count % 3 == 0) or (tid not in self._last_face_results)
            face_info = self._last_face_results.get(tid, None)

            if should_detect_face and self.face_detector.is_ready:
                # Localize face within person bounding box
                faces = self.face_detector.detect(frame_bgr, person_box=p_box)
                if not faces:
                    # If person bbox didn't catch face, try upper frame region of target
                    faces = self.face_detector.detect(frame_bgr, person_box=[p_box[0] - 10, p_box[1] - 10, p_box[2] + 20, int(p_box[3] * 0.7)])

                if faces:
                    best_face = max(faces, key=lambda f: f["confidence"])
                    raw_face = best_face["raw_face"]

                    # Extract 128D embedding & match against watchlist
                    query_emb = self.face_extractor.extract_embedding(frame_bgr, raw_face)
                    match_result = self.face_matcher.match(query_emb, camera_id=self.camera_id)

                    # Diagnostic emotion check (isolated from security threat)
                    fx, fy, fw, fh = best_face["box"]
                    face_crop = frame_bgr[max(0, fy):min(h, fy + fh), max(0, fx):min(w, fx + fw)]
                    emotion_res = self.emotion_classifier.analyze(face_crop)

                    face_info = {
                        "has_face": True,
                        "face_box": best_face["box"],
                        "face_confidence": best_face["confidence"],
                        "landmarks": best_face["landmarks"],
                        "match": match_result,
                        "emotion": emotion_res
                    }
                    self._last_face_results[tid] = face_info
                else:
                    face_info = {
                        "has_face": False,
                        "face_box": None,
                        "face_confidence": 0.0,
                        "landmarks": [],
                        "match": {
                            "face_match": False,
                            "status": "UNKNOWN PERSON",
                            "person_code": None,
                            "display_name": "UNKNOWN",
                            "similarity": 0.0
                        },
                        "emotion": {
                            "primary_expression": "Neutral",
                            "confidence": 60.0
                        }
                    }
                    self._last_face_results[tid] = face_info

            # Fallback if no face info
            if face_info is None:
                face_info = {
                    "has_face": False,
                    "landmarks": [],
                    "match": {"face_match": False, "status": "UNKNOWN PERSON", "person_code": None, "display_name": "UNKNOWN", "similarity": 0.0},
                    "emotion": {"primary_expression": "Neutral", "confidence": 50.0}
                }

            if face_info["match"].get("face_match"):
                active_face_matches.append(face_info["match"])

            # Build enriched person target dictionary for HUD and dashboard
            disp_name = face_info["match"].get("display_name")
            has_face = bool(face_info.get("has_face", False))
            if disp_name and disp_name != "UNKNOWN":
                hud_name = f"KNOWN: {disp_name} ({face_info['match'].get('similarity', 0)*100:.0f}%)"
                face_status = "KNOWN"
            elif has_face:
                hud_name = "FACE DETECTED: UNKNOWN"
                face_status = "FACE DETECTED / UNKNOWN"
            else:
                hud_name = "FACE: NOT VISIBLE"
                face_status = "NO FACE VISIBLE"

            p_trk_enriched = {
                "target_id": tid,
                "track_id": tid,
                "camera_id": self.camera_id,
                "box": p_box,
                "bbox": p_box,
                "normalized_box": p_trk["normalized_box"],
                "detection_confidence": p_trk["confidence_pct"],
                "confidence_pct": p_trk["confidence_pct"],
                "target_type": "person",
                "category": "person",
                "class_name": "person",
                "direction": p_trk["direction"],
                "movement": p_trk["movement"],
                "relative_speed": p_trk["relative_speed"],
                "speed_label": p_trk["speed_label"],
                "dwell_seconds": p_trk["dwell_seconds"],
                "first_seen": p_trk["first_seen"],
                "last_seen": p_trk["last_seen"],
                "has_face": has_face,
                "face_status": face_status,
                "face_match": face_info["match"],
                "landmarks": face_info.get("landmarks", []),
                "emotion": face_info.get("emotion", {"primary_expression": "Neutral", "confidence": 50.0}),
                "hud_label": f"PERSON {tid} [{p_trk['confidence_pct']:.0f}%] | {p_trk['direction']}",
                "hud_name": hud_name,
            }

            enriched_person_targets.append(p_trk_enriched)

        # ── 4. Dedicated ANPR on Vehicle Tracks ──────────────────────────────
        active_anpr_results = []
        enriched_vehicle_targets = []

        for v_trk in vehicle_tracks:
            v_tid = v_trk["track_id"]
            v_box = v_trk["bbox"]
            v_class = v_trk.get("class_name", "car").upper()

            should_scan_plate = (self._frame_count % 4 == 0) or (v_tid not in self._last_plate_results)
            plate_info = self._last_plate_results.get(v_tid, None)

            if should_scan_plate:
                plate_candidates = self.plate_detector.detect_plates(frame_bgr, vehicle_box=v_box)
                plate_read = None

                for cand in plate_candidates:
                    ocr_res = self.plate_ocr.read_plate(cand["plate_crop"])
                    val_res = PlateValidator.validate(ocr_res["text"], ocr_res["confidence"])
                    if val_res["is_valid"]:
                        plate_read = {
                            **val_res,
                            "vehicle_track_id": v_tid,
                            "bbox": cand["bbox"],
                            "camera_id": self.camera_id
                        }
                        active_anpr_results.append(plate_read)
                        break

                if plate_read:
                    plate_info = plate_read
                else:
                    plate_info = {
                        "is_valid": False,
                        "plate_text": "N/A",
                        "formatted_plate": "N/A",
                        "status": "STANDBY",
                        "confidence": 0.0
                    }
                self._last_plate_results[v_tid] = plate_info

            if plate_info is None:
                plate_info = {"is_valid": False, "plate_text": "N/A", "formatted_plate": "N/A", "confidence": 0.0}

            enriched_vehicle_targets.append({
                "track_id": v_tid,
                "target_id": v_tid,
                "camera_id": self.camera_id,
                "box": v_box,
                "bbox": v_box,
                "normalized_box": v_trk["normalized_box"],
                "object_type": v_class,
                "class_name": v_class.lower(),
                "category": "vehicle",
                "confidence": v_trk["confidence_pct"],
                "confidence_pct": v_trk["confidence_pct"],
                "plate": plate_info.get("formatted_plate", "N/A"),
                "plate_valid": plate_info.get("is_valid", False),
                "direction": v_trk["direction"],
                "movement": v_trk["movement"],
                "relative_speed": v_trk["relative_speed"],
                "speed_label": v_trk["speed_label"],
                "dwell_seconds": v_trk["dwell_seconds"],
                "first_seen": v_trk["first_seen"],
                "last_seen": v_trk["last_seen"],
                "simulated": False,
                "hud": f"[VEHICLE: {v_class} | {v_tid} | CONF: {v_trk['confidence_pct']:.0f}%]"
            })

        # ── 5. Zone Analysis & Context-Based Risk Engine ─────────────────────
        combined_for_zone = (
            enriched_person_targets
            + [
                {
                    "target_id": v["track_id"],
                    "box": v["box"],
                    "normalized_box": v["normalized_box"],
                    "target_type": "vehicle"
                }
                for v in enriched_vehicle_targets
            ]
            + [
                {
                    "target_id": o["track_id"],
                    "box": o["bbox"],
                    "normalized_box": o["normalized_box"],
                    "target_type": "object"
                }
                for o in object_tracks
            ]
        )
        analyzed_zone_targets = self.zone_analyzer.analyze(combined_for_zone, w, h)

        # Map zone telemetry and transparent rule-based risk back to all tracks
        zone_lookup = {t.get("target_id"): t for t in analyzed_zone_targets}
        for pt in enriched_person_targets:
            zinfo = zone_lookup.get(pt["target_id"], {})
            pt["in_restricted_zone"] = zinfo.get("in_restricted_zone", False)
            pt["zone_name"] = zinfo.get("zone_name", "SECTOR ALPHA")
            pt["loitering"] = zinfo.get("loitering", False)
            pt["dwell_seconds"] = zinfo.get("dwell_seconds", pt["dwell_seconds"])

            if pt["in_restricted_zone"] and pt["loitering"]:
                pt["risk_level"] = "CRITICAL"
                pt["risk_reason"] = f"PERSON LOITERING IN RESTRICTED ZONE ({pt['dwell_seconds']:.0f}s)"
            elif pt["in_restricted_zone"]:
                pt["risk_level"] = "HIGH RISK"
                pt["risk_reason"] = "PERSON CROSSED RESTRICTED BOUNDARY"
            elif pt["loitering"]:
                pt["risk_level"] = "SUSPICIOUS EVENT"
                pt["risk_reason"] = f"EXTENDED DWELL TIME ({pt['dwell_seconds']:.0f}s)"
            else:
                pt["risk_level"] = "MONITORED"
                pt["risk_reason"] = "PERSON TRACKED IN CORRIDOR"

        for vt in enriched_vehicle_targets:
            zinfo = zone_lookup.get(vt["track_id"], {})
            vt["in_restricted_zone"] = zinfo.get("in_restricted_zone", False)
            vt["zone_name"] = zinfo.get("zone_name", "SECTOR ALPHA")
            vt["loitering"] = zinfo.get("loitering", False)

            if vt["in_restricted_zone"]:
                vt["risk_level"] = "HIGH RISK"
                vt["risk_reason"] = f"VEHICLE ({vt['object_type']}) IN RESTRICTED ZONE"
            else:
                vt["risk_level"] = "MONITORED"
                vt["risk_reason"] = f"VEHICLE ({vt['object_type']}) TRACKED"

        other_objects = []
        for ot in object_tracks:
            zinfo = zone_lookup.get(ot["track_id"], {})
            in_zone = zinfo.get("in_restricted_zone", False)
            dwell = zinfo.get("dwell_seconds", ot.get("dwell_seconds", 0.0))
            cname = ot.get("class_name", "object").lower()

            if cname in ("backpack", "suitcase", "handbag") and in_zone and dwell >= 15.0:
                risk_level = "SUSPICIOUS EVENT"
                risk_reason = f"BAG IN RESTRICTED ZONE ({dwell:.0f}s)"
            elif cname in ("backpack", "suitcase", "handbag"):
                risk_level = "MONITORED"
                risk_reason = "CARRIED / TRACKED ITEM"
            else:
                risk_level = "NORMAL"
                risk_reason = "NORMAL OBJECT"

            other_objects.append({
                **ot,
                "target_id": ot["track_id"],
                "class": cname,
                "in_restricted_zone": in_zone,
                "zone_name": zinfo.get("zone_name", "SECTOR ALPHA"),
                "dwell_seconds": dwell,
                "risk_level": risk_level,
                "risk_reason": risk_reason,
            })

        # ── 6. Observable CV Event Engine Processing ─────────────────────────
        # Combine person & vehicle tracks with full telemetry for event engine
        engine_tracks = [
            {
                "track_id": pt["target_id"],
                "category": "person",
                "class_name": "person",
                "confidence_pct": pt["detection_confidence"],
                "in_restricted_zone": pt["in_restricted_zone"],
                "loitering": pt["loitering"],
                "dwell_seconds": pt["dwell_seconds"],
                "direction": pt["direction"],
                "relative_speed": pt["relative_speed"]
            }
            for pt in enriched_person_targets
        ] + [
            {
                "track_id": vt["track_id"],
                "category": "vehicle",
                "class_name": vt["object_type"].lower(),
                "confidence_pct": vt["confidence"],
                "in_restricted_zone": vt["in_restricted_zone"],
                "loitering": vt["loitering"],
                "dwell_seconds": vt["dwell_seconds"],
                "direction": vt["direction"],
                "relative_speed": vt["relative_speed"]
            }
            for vt in enriched_vehicle_targets
        ]

        ee_result = self.event_engine.process(
            tracks=engine_tracks,
            face_matches=active_face_matches,
            anpr_results=active_anpr_results,
            camera_id=self.camera_id
        )

        latency_ms = round((time.time() - t_start) * 1000, 1)
        fps = round(1000.0 / max(1.0, latency_ms), 1)

        kpis = {
            "total_persons": len(enriched_person_targets),
            "active_vehicles": len(enriched_vehicle_targets),
            "active_tracks": len(all_tracks),
            "face_matches": len(active_face_matches),
            "anpr_events": len(active_anpr_results),
            "active_intrusions": ee_result.get("kpis", {}).get("zone_intrusions", 0),
            "active_alerts": len(ee_result.get("alerts", [])),
            "fps": fps
        }

        # ── 7. Build Unified Telemetry Payload ──────────────────────────────
        return {
            "camera_id": self.camera_id,
            "kpis": kpis,
            "targets": enriched_person_targets,
            "vehicles": enriched_vehicle_targets,
            "tracks": all_tracks,
            "other_objects": other_objects,
            "total_faces": len(enriched_person_targets),
            "face_matches": active_face_matches,
            "anpr_events": active_anpr_results,
            "alerts": ee_result.get("alerts", []),
            "events": ee_result.get("events", []),
            "ai_alerts": ee_result.get("alerts", []),
            "ai_events": ee_result.get("events", []),
            "threat_score": ee_result.get("threat_score", 0),
            "high_threat_count": sum(1 for a in ee_result.get("alerts", []) if a.get("severity") in ("CRITICAL", "HIGH")),
            "zone_intrusions": ee_result.get("kpis", {}).get("zone_intrusions", 0),
            "loitering_count": ee_result.get("kpis", {}).get("loitering_count", 0),
            "frame_size": {"width": w, "height": h},
            "analytics_enabled": self.analytics_enabled,
            "ai_stats": {
                "yolo_status": self.yolo_detector.status()["status"],
                "yolo_model": self.yolo_detector.model_path,
                "yolo_device": self.yolo_detector.device,
                "face_engine": "YuNet + SFace-128D (ONNX)",
                "anpr_status": self.plate_detector.status()["status"],
                "persons_count": len(enriched_person_targets),
                "vehicles_count": len(enriched_vehicle_targets),
                "active_tracks": len(all_tracks),
                "zone_intrusions": ee_result.get("kpis", {}).get("zone_intrusions", 0),
                "loitering_count": ee_result.get("kpis", {}).get("loitering_count", 0),
                "face_matches_count": len(active_face_matches),
                "anpr_events_count": len(active_anpr_results),
                "objects_count": len(other_objects),
                "total_detections": len(self._last_yolo_detections),
                "weapon_detection": "NOT CONFIGURED",
                "latency_ms": latency_ms
            }
        }

    def _empty_result(self, w: int, h: int) -> Dict[str, Any]:
        return {
            "camera_id": self.camera_id,
            "kpis": {
                "total_persons": 0,
                "active_vehicles": 0,
                "active_tracks": 0,
                "face_matches": 0,
                "anpr_events": 0,
                "active_intrusions": 0,
                "active_alerts": 0,
                "fps": 0.0
            },
            "targets": [],
            "vehicles": [],
            "tracks": [],
            "other_objects": [],
            "total_faces": 0,
            "face_matches": [],
            "anpr_events": [],
            "alerts": [],
            "ai_alerts": [],
            "ai_events": [],
            "threat_score": 0,
            "high_threat_count": 0,
            "zone_intrusions": 0,
            "loitering_count": 0,
            "frame_size": {"width": w, "height": h},
            "analytics_enabled": self.analytics_enabled,
            "ai_stats": {
                "yolo_status": "OFFLINE",
                "face_engine": "STANDBY",
                "anpr_status": "STANDBY",
                "persons_count": 0,
                "vehicles_count": 0,
                "active_tracks": 0,
                "objects_count": 0,
                "total_detections": 0,
                "weapon_detection": "NOT CONFIGURED",
                "latency_ms": 0.0
            }
        }
