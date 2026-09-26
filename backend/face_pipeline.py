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
      IBVAP COMMAND CENTER
    """

    def __init__(self, engine: str = "yunet", camera_id: str = "CAM-01"):
        self.camera_id = camera_id
        self.analytics_enabled = True
        self._frame_count = 0

        # 1. Primary Object Detection & Tracking
        self.yolo_detector = YoloDetector(camera_id=camera_id)
        self.tracker = MultiObjectTracker(max_disappeared=25, iou_threshold=0.25)
        self._trackers: Dict[str, MultiObjectTracker] = {
            "CAM-01": self.tracker,
            "CAM-02": MultiObjectTracker(max_disappeared=25, iou_threshold=0.25),
            "CAM-03": MultiObjectTracker(max_disappeared=25, iou_threshold=0.25),
            "CAM-04": MultiObjectTracker(max_disappeared=25, iou_threshold=0.25),
        }

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
        self.zone_analyzer = ZoneAnalyzer(camera_id=camera_id)
        self.event_engine = SurveillanceEventEngine(camera_id=camera_id)

        # 5. Optional diagnostic emotion classifier (isolated from primary threat logic)
        self.emotion_classifier = EmotionClassifier()

        # Cached state for performance throttling on CPU
        self._last_yolo_detections: List[Dict[str, Any]] = []
        self._last_yolo_by_cam: Dict[str, List[Dict[str, Any]]] = {}
        self._last_face_results: Dict[str, Dict[str, Any]] = {}
        self._last_plate_results: Dict[str, Dict[str, Any]] = {}

        # Spatial-temporal holding & behavioral tracking state
        self._holding_history: Dict[Tuple[str, str], int] = {}
        self._face_stare_start: Dict[str, float] = {}
        self._last_direction: Dict[str, str] = {}
        self._direction_reversals: Dict[str, int] = {}

        logger.info("[+] SurveillanceVisionPipeline initialized with real multi-object analytics.")

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        confidence_threshold: float = 0.40,
        engine: Optional[str] = None,
        vehicle_detections: Optional[List[Dict[str, Any]]] = None,
        camera_id: Optional[str] = None,
        is_demo: bool = False,
        scenario_label: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes end-to-end multi-object surveillance analysis on a video frame.
        """
        cam_id = camera_id or self.camera_id
        if frame_bgr is None or frame_bgr.size == 0:
            return self._empty_result(640, 360)

        h, w = frame_bgr.shape[:2]
        self._frame_count += 1
        t_start = time.time()

        if not self.analytics_enabled:
            return self._empty_result(w, h)

        # ── 1. YOLO Object Detection (Every 1-2 frames for smooth CPU latency) ──
        cached_dets = self._last_yolo_by_cam.get(cam_id, [])
        run_yolo = (cam_id != "CAM-01") or (self._frame_count % 2 == 0) or (len(cached_dets) == 0)
        if run_yolo and self.yolo_detector.is_ready:
            try:
                dets = self.yolo_detector.detect(
                    frame_bgr,
                    confidence_threshold=confidence_threshold,
                    camera_id=cam_id
                )
                self._last_yolo_by_cam[cam_id] = dets
                if cam_id == self.camera_id:
                    self._last_yolo_detections = dets
                cached_dets = dets
            except Exception as e:
                logger.debug(f"YOLO inference error: {e}")

        # ── 2. Multi-Object Tracking (Persons, Vehicles, Objects) ─────────────
        cam_tracker = self._trackers.get(cam_id)
        if cam_tracker is None:
            cam_tracker = MultiObjectTracker(max_disappeared=25, iou_threshold=0.25)
            self._trackers[cam_id] = cam_tracker
        all_tracks = cam_tracker.update(cached_dets, (h, w), camera_id=cam_id)

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
        analyzed_zone_targets = self.zone_analyzer.analyze(combined_for_zone, w, h, camera_id=cam_id)
        cam_zone_cfg = self.zone_analyzer.get_zone_for_camera(cam_id)
        default_zone_label = cam_zone_cfg.get("name", "BORDER ZONE A")

        # Map zone telemetry, spatial-temporal relationships, activity inference, behavioral signals, and explainable risk
        zone_lookup = {t.get("target_id"): t for t in analyzed_zone_targets}
        now_epoch = time.time()
        time_seen_str = time.strftime("%H:%M:%S")

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
                "zone_name": zinfo.get("zone_name", "BORDER ZONE A"),
                "dwell_seconds": dwell,
                "risk_level": risk_level,
                "risk_reason": risk_reason,
            })

        # Vehicle zone & observable activity enrichment
        for vt in enriched_vehicle_targets:
            zinfo = zone_lookup.get(vt["track_id"], {})
            vt["in_restricted_zone"] = zinfo.get("in_restricted_zone", False)
            vt["zone_name"] = zinfo.get("zone_name", "BORDER ZONE A")
            vt["loitering"] = zinfo.get("loitering", False)
            v_speed = vt.get("relative_speed", 0.0)

            if vt["in_restricted_zone"]:
                vt["activity"] = "VEHICLE ENTERING RESTRICTED AREA"
                vt["risk_level"] = "HIGH RISK"
                vt["risk_reason"] = f"VEHICLE ({vt['object_type']}) IN RESTRICTED ZONE"
            elif v_speed < 8.0:
                vt["activity"] = "VEHICLE STOPPING"
                vt["risk_level"] = "MONITORED"
                vt["risk_reason"] = f"VEHICLE ({vt['object_type']}) STOPPED IN CORRIDOR"
            else:
                vt["activity"] = "VEHICLE APPROACHING"
                vt["risk_level"] = "MONITORED"
                vt["risk_reason"] = f"VEHICLE ({vt['object_type']}) TRACKED"

        # Spatial-temporal Person + Object & Person + Vehicle relationship engine
        relationships: List[Dict[str, Any]] = []
        active_pair_keys = set()

        CARRYABLE_BAGS = {"backpack", "suitcase", "handbag"}
        HOLDABLE_ITEMS = {
            "cell phone", "bottle", "cup", "laptop", "book", "umbrella",
            "scissors", "knife", "remote", "keyboard", "mouse",
            "baseball bat", "sports ball", "clock", "wine glass", "fork", "spoon", "pen"
        }

        for pt in enriched_person_targets:
            ptid = pt["target_id"]
            px, py, pw, ph = pt["bbox"]
            pcx = px + pw / 2.0
            pcy = py + ph / 2.0

            holding_objs = []
            nearby_objs = []

            for ot in other_objects:
                otid = ot["track_id"]
                ox, oy, ow, oh = ot["bbox"]
                ocx = ox + ow / 2.0
                ocy = oy + oh / 2.0
                oname = (ot.get("class_name") or ot.get("class") or "object").lower()
                oconf = float(ot.get("confidence_pct", 50.0))

                # Compute intersection and containment of object within expanded person box
                ix1 = max(px - int(0.15 * pw), ox)
                iy1 = max(py - int(0.05 * ph), oy)
                ix2 = min(px + int(1.15 * pw), ox + ow)
                iy2 = min(py + int(1.08 * ph), oy + oh)
                inter_area = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                obj_area = max(1, ow * oh)
                containment = inter_area / obj_area
                dist = float(np.hypot(pcx - ocx, pcy - ocy))
                norm_dist = dist / max(40.0, float(max(pw, ph)))

                pair_key = (ptid, otid)
                active_pair_keys.add(pair_key)

                # Check spatial criteria for holding/carrying
                in_hand_or_body = (containment >= 0.30) or (norm_dist <= 0.62)
                if in_hand_or_body and oconf >= 38.0:
                    self._holding_history[pair_key] = self._holding_history.get(pair_key, 0) + 1
                else:
                    self._holding_history[pair_key] = max(0, self._holding_history.get(pair_key, 0) - 1)

                frames_confirmed = self._holding_history.get(pair_key, 0)

                # Require temporal confirmation (>= 2 frames) OR high containment + high confidence
                is_confirmed_holding = (
                    (frames_confirmed >= 2 or (containment >= 0.60 and oconf >= 50.0))
                    and (oname in CARRYABLE_BAGS or oname in HOLDABLE_ITEMS)
                )

                if is_confirmed_holding:
                    rel_verb = "CARRYING" if oname in CARRYABLE_BAGS else "HOLDING"
                    holding_objs.append({
                        "track_id": otid,
                        "class_name": oname.upper(),
                        "relation": rel_verb,
                        "confidence": round(oconf, 1),
                        "frames_confirmed": frames_confirmed,
                    })
                    ot["held_by"] = ptid
                    ot["relationship_label"] = f"{rel_verb} BY {ptid}"
                    relationships.append({
                        "subject": f"PERSON #{ptid}",
                        "relation": rel_verb,
                        "object": f"{oname.upper()} ({otid})",
                        "confidence": round(min(pt["confidence_pct"], oconf), 1),
                        "confirmed": True,
                    })
                elif norm_dist <= 1.35 or containment > 0.05:
                    nearby_objs.append({
                        "track_id": otid,
                        "class_name": oname.upper(),
                        "relation": "OBJECT NEAR PERSON",
                        "confidence": round(oconf, 1),
                    })
                    ot["relationship_label"] = f"NEAR {ptid}"
                    relationships.append({
                        "subject": f"PERSON #{ptid}",
                        "relation": "NEAR",
                        "object": f"{oname.upper()} ({otid})",
                        "confidence": round(min(pt["confidence_pct"], oconf), 1),
                        "confirmed": False,
                    })

            # Check Person + Vehicle proximity relationship
            nearby_vehs = []
            for vt in enriched_vehicle_targets:
                vtid = vt["track_id"]
                vx, vy, vw, vh = vt["bbox"]
                vcx = vx + vw / 2.0
                vcy = vy + vh / 2.0
                vdist = float(np.hypot(pcx - vcx, pcy - vcy))
                if vdist <= 1.35 * max(pw, ph, vw, vh):
                    nearby_vehs.append(vt)
                    relationships.append({
                        "subject": f"PERSON #{ptid}",
                        "relation": "NEAR",
                        "object": f"VEHICLE #{vtid} ({vt['object_type']})",
                        "confidence": round(min(pt["confidence_pct"], vt["confidence"]), 1),
                        "confirmed": True,
                    })

            pt["holding_objects"] = holding_objs
            pt["nearby_objects"] = nearby_objs
            pt["nearby_vehicles"] = [v["track_id"] for v in nearby_vehs]

            if holding_objs:
                primary_held = holding_objs[0]
                pt["holding_status"] = f"HOLDING: {primary_held['class_name']}"
                pt["object_interaction"] = f"{primary_held['relation']}: {primary_held['class_name']}"
            elif nearby_objs:
                primary_near = nearby_objs[0]
                pt["holding_status"] = f"OBJECT NEAR PERSON: {primary_near['class_name']}"
                pt["object_interaction"] = f"OBJECT NEAR PERSON ({primary_near['class_name']})"
            else:
                pt["holding_status"] = "NONE"
                pt["object_interaction"] = "NONE"

        # Prune stale holding history pairs
        for pk in list(self._holding_history.keys()):
            if pk not in active_pair_keys:
                self._holding_history[pk] = max(0, self._holding_history[pk] - 1)
                if self._holding_history[pk] == 0:
                    del self._holding_history[pk]

        # Person Zone, Activity Inference, Behavioral Signals, Explainable Risk & Activity Card
        multiple_people_gathering = len(enriched_person_targets) >= 2
        fence_events = []

        for pt in enriched_person_targets:
            tid = pt["target_id"]
            zinfo = zone_lookup.get(tid, {})
            in_zone = zinfo.get("in_restricted_zone", False)
            zone_move = zinfo.get("movement", pt.get("movement", "STATIONARY"))
            loitering = zinfo.get("loitering", False)
            dwell = zinfo.get("dwell_seconds", pt["dwell_seconds"])
            z_event = zinfo.get("zone_event")
            z_name = zinfo.get("zone_name") or default_zone_label

            pt["in_restricted_zone"] = in_zone
            pt["zone_name"] = f"{z_name} [PROTECTED]" if in_zone else default_zone_label
            pt["zone_event"] = z_event
            pt["loitering"] = loitering
            pt["dwell_seconds"] = dwell

            px, py, pw, ph = pt["bbox"]
            aspect_ratio = ph / max(1.0, float(pw))
            speed = float(pt.get("relative_speed", 0.0))
            direction = pt.get("direction", "STATIONARY")

            # 1. Base observable locomotion & speed category
            if speed > 135.0:
                locomotion = "RUNNING"
                speed_category = "FAST"
            elif speed > 14.0:
                locomotion = "WALKING"
                speed_category = "NORMAL"
            else:
                speed_category = "STATIONARY"
                locomotion = "SITTING" if aspect_ratio < 1.32 else "STANDING"

            # 2. Virtual fence crossing check (Zero-line at ~82% height)
            foot_y_norm = (py + ph) / max(1.0, float(h))
            crossing_fence = (0.78 <= foot_y_norm <= 0.86) and speed > 18.0
            if crossing_fence:
                fence_events.append({"track_id": tid, "fence_name": "Zero-Line BP-44"})

            # 3. High-level observable activity inference
            holding_objs = pt.get("holding_objects", [])
            nearby_objs = pt.get("nearby_objects", [])
            nx, ny, nw, nh = pt.get("normalized_box", [0.5, 0.5, 0.1, 0.2])
            approaching_zone = (not in_zone) and (0.15 <= nx + nw / 2 <= 0.85) and (speed > 8.0 or direction in ("EAST", "SOUTH-EAST", "NORTH-EAST", "SOUTH"))

            if crossing_fence:
                activity_label = "CROSSING VIRTUAL FENCE"
            elif z_event == "PROTECTED_AREA_INTRUSION":
                activity_label = "PROTECTED-AREA INTRUSION"
            elif zone_move == "ENTERING" or (in_zone and dwell < 3.0):
                activity_label = "RESTRICTED-ZONE ENTRY"
            elif zone_move == "EXITING":
                activity_label = "LEAVING RESTRICTED ZONE"
            elif in_zone and loitering:
                activity_label = "PROLONGED PRESENCE IN RESTRICTED ZONE"
            elif in_zone and holding_objs:
                activity_label = f"RESTRICTED ZONE WITH {holding_objs[0]['class_name']}"
            elif in_zone:
                activity_label = "INSIDE RESTRICTED ZONE"
            elif approaching_zone:
                activity_label = "APPROACHING RESTRICTED AREA"
            elif multiple_people_gathering and speed < 25.0:
                activity_label = "MULTIPLE PEOPLE GATHERING"
            elif holding_objs and locomotion in ("WALKING", "RUNNING"):
                activity_label = f"{locomotion} WITH {holding_objs[0]['class_name']}"
            elif holding_objs:
                activity_label = f"HOLDING {holding_objs[0]['class_name']}"
            elif nearby_objs:
                activity_label = f"PERSON-OBJECT INTERACTION ({nearby_objs[0]['class_name']})"
            elif loitering or dwell >= 15.0:
                activity_label = "PROLONGED PRESENCE"
            elif speed > 135.0:
                activity_label = "UNUSUAL MOVEMENT (RUNNING)"
            else:
                activity_label = locomotion

            pt["locomotion"] = locomotion
            pt["speed_category"] = speed_category
            pt["activity"] = activity_label

            # 4. Observable Behavioral Signals & Transparent Expression Handling
            behavioral_signals: List[Dict[str, Any]] = []

            # Track continuous camera/checkpoint observation duration
            if pt.get("has_face") and speed < 20.0:
                if tid not in self._face_stare_start:
                    self._face_stare_start[tid] = now_epoch
                stare_dur = now_epoch - self._face_stare_start[tid]
                if stare_dur >= 6.0:
                    behavioral_signals.append({
                        "signal": f"Prolonged observation toward camera/checkpoint ({stare_dur:.0f}s)",
                        "confidence": "MEDIUM" if stare_dur >= 10.0 else "LOW",
                        "note": "Observable gaze duration — NOT a confirmed threat"
                    })
            else:
                self._face_stare_start.pop(tid, None)

            # Head orientation asymmetry from facial landmarks
            landmarks = pt.get("landmarks", [])
            if len(landmarks) >= 3:
                try:
                    re_x, le_x, nose_x = landmarks[0][0], landmarks[1][0], landmarks[2][0]
                    eye_span = max(1.0, abs(le_x - re_x))
                    nose_offset = abs(( nose_x - (re_x + le_x) / 2.0 )) / eye_span
                    if nose_offset > 0.36:
                        behavioral_signals.append({
                            "signal": "Unusual lateral head orientation toward sector boundary",
                            "confidence": "LOW",
                            "note": "Observable head pose signal"
                        })
                except Exception:
                    pass

            # Track direction reversals (approach/retreat behavior)
            prev_dir = self._last_direction.get(tid)
            if prev_dir and direction != "STATIONARY" and prev_dir != "STATIONARY" and direction != prev_dir:
                self._direction_reversals[tid] = self._direction_reversals.get(tid, 0) + 1
            self._last_direction[tid] = direction

            if self._direction_reversals.get(tid, 0) >= 3:
                behavioral_signals.append({
                    "signal": "Repeated approach/retreat trajectory changes",
                    "confidence": "MEDIUM",
                    "note": "Observable trajectory oscillation"
                })

            if speed > 135.0:
                behavioral_signals.append({
                    "signal": f"Sudden rapid movement ({speed:.0f} px/s)",
                    "confidence": "MEDIUM",
                    "note": "High relative optical velocity"
                })

            if dwell >= 12.0 and speed < 10.0:
                behavioral_signals.append({
                    "signal": f"Prolonged stationary behavior ({dwell:.0f}s)",
                    "confidence": "MEDIUM",
                    "note": "Extended stationary presence"
                })

            # Facial expression (Diagnostic ONLY — NEVER a threat classifier by itself)
            emotion_obj = pt.get("emotion", {})
            expr_name = (emotion_obj.get("primary_expression") or "Neutral").upper()
            expr_conf = float(emotion_obj.get("confidence", 60.0))

            # 5. Explainable Risk Engine (0 - 100)
            risk_score = 10  # Baseline monitored presence
            contributing_signals = []
            reasons = []

            if in_zone:
                risk_score += 45
                contributing_signals.append({"signal": "Restricted zone entry", "points": 45})
                reasons.append("Person entered restricted zone")

            if loitering or dwell >= 15.0:
                pts = 22 if in_zone else 15
                risk_score += pts
                contributing_signals.append({"signal": f"Prolonged presence ({dwell:.0f}s)", "points": pts})
                reasons.append(f"Person remained in monitored area for {dwell:.0f} seconds")
            elif dwell >= 8.0 and in_zone:
                risk_score += 10
                contributing_signals.append({"signal": f"Dwell inside restricted zone ({dwell:.0f}s)", "points": 10})
                reasons.append(f"Person remained inside restricted zone for {dwell:.0f} seconds")

            if crossing_fence:
                risk_score += 25
                contributing_signals.append({"signal": "Virtual fence crossing", "points": 25})
                reasons.append("Person crossed virtual zero-line fence boundary")
            elif approaching_zone:
                risk_score += 12
                contributing_signals.append({"signal": "Approaching restricted checkpoint", "points": 12})
                reasons.append("Person moving toward protected boundary")

            if speed > 135.0:
                risk_score += 15
                contributing_signals.append({"signal": "Unusual rapid movement", "points": 15})
                reasons.append(f"Unusual rapid movement ({speed:.0f} px/s)")

            if pt.get("nearby_vehicles"):
                risk_score += 12
                contributing_signals.append({"signal": "Vehicle proximity in sector", "points": 12})
                reasons.append(f"Proximity to vehicle ({', '.join(pt['nearby_vehicles'])})")

            if holding_objs and any(h["class_name"] in ("BACKPACK", "SUITCASE", "HANDBAG") for h in holding_objs) and in_zone:
                risk_score += 10
                contributing_signals.append({"signal": "Carrying baggage in restricted zone", "points": 10})
                reasons.append(f"Carrying {holding_objs[0]['class_name']} inside restricted zone")

            if pt.get("face_match", {}).get("face_match") and pt["face_match"].get("identity_status") == "WATCHLIST":
                risk_score += 35
                contributing_signals.append({"signal": "Enrolled watchlist facial match", "points": 35})
                reasons.append(f"Matched enrolled watchlist subject ({pt['face_match'].get('display_name')})")

            # Expression NEVER increases risk alone — only when combined with restricted zone + behavioral signal
            if expr_name in ("ANGRY", "FEAR") and in_zone and len(behavioral_signals) > 0:
                risk_score += 5
                contributing_signals.append({
                    "signal": f"{expr_name} expression + unusual behavior + restricted zone (Combined contextual signal)",
                    "points": 5
                })
                reasons.append(f"Combined signal: {expr_name} expression with unusual behavior inside restricted zone")

            risk_score = min(100, max(5, risk_score))

            if risk_score >= 75:
                pt["risk_level"] = "CRITICAL"
                card_status = "HIGH RISK"
                primary_reason = reasons[0].upper() if reasons else "CRITICAL RESTRICTED-ZONE BREACH"
            elif risk_score >= 50 or in_zone:
                pt["risk_level"] = "HIGH RISK"
                card_status = "HIGH RISK"
                primary_reason = "RESTRICTED-ZONE ENTRY" if in_zone else (reasons[0].upper() if reasons else "HIGH RISK ACTIVITY")
            elif risk_score >= 28:
                pt["risk_level"] = "MEDIUM"
                card_status = "MONITORED"
                primary_reason = reasons[0].upper() if reasons else "PROLONGED / UNUSUAL MOVEMENT"
            else:
                pt["risk_level"] = "NORMAL"
                card_status = "MONITORED"
                primary_reason = "STANDARD CORRIDOR PRESENCE"

            pt["risk_score"] = risk_score
            pt["risk_reason"] = primary_reason
            pt["contributing_signals"] = contributing_signals
            pt["reasons"] = [f"{i+1}. {r}" for i, r in enumerate(reasons)] if reasons else ["1. Routine monitored presence in border corridor (No threat signals)"]
            pt["behavioral_signals"] = behavioral_signals

            # Honest facial status formatting for Person Activity Card
            fm = pt.get("face_match", {})
            if fm.get("face_match") and fm.get("display_name") and fm.get("display_name") != "UNKNOWN":
                face_card_status = f"FACE DETECTED | KNOWN PERSON ({fm.get('display_name')})"
            elif pt.get("has_face"):
                face_card_status = "FACE DETECTED | UNKNOWN PERSON (NO MATCH)"
            else:
                face_card_status = "NO FACE DETECTED"

            # Build structured PERSON ACTIVITY CARD (Requirement 5)
            pt["activity_card"] = {
                "person_id": f"PERSON #{tid}",
                "track_id": tid,
                "status": card_status,
                "location": "BORDER ZONE A [RESTRICTED]" if in_zone else "BORDER ZONE A",
                "movement": locomotion,
                "direction": direction,
                "speed": speed_category,
                "speed_px_s": round(speed, 1),
                "object": pt["holding_status"],
                "activity": activity_label,
                "time_seen": time_seen_str,
                "dwell_seconds": round(dwell, 1),
                "face_status": face_card_status,
                "expression": f"{expr_name} ({expr_conf:.0f}%) [NON-THREAT DIAGNOSTIC]",
                "behavioral_signals": behavioral_signals,
                "risk": pt["risk_level"],
                "risk_score": risk_score,
                "reason": primary_reason,
                "contributing_signals": contributing_signals,
                "reasons": pt["reasons"],
            }

        # ── 6. Observable CV Event Engine Processing ─────────────────────────
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
                "relative_speed": pt["relative_speed"],
                "holding_status": pt.get("holding_status", "NONE"),
                "activity": pt.get("activity", "MONITORED"),
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
                "relative_speed": vt["relative_speed"],
                "holding_status": "NONE",
                "activity": vt.get("activity", "VEHICLE MONITORED"),
            }
            for vt in enriched_vehicle_targets
        ]

        ee_result = self.event_engine.process(
            tracks=engine_tracks,
            face_matches=active_face_matches,
            anpr_results=active_anpr_results,
            fence_events=fence_events,
            camera_id=cam_id
        )

        # If processing a demo video/image frame, clearly mark generated alerts as DEMO / SIMULATION
        for alt in ee_result.get("alerts", []):
            alt["is_demo"] = is_demo
            if is_demo:
                if "[DEMO / SIMULATION]" not in alt.get("title", ""):
                    alt["title"] = f"{alt.get('title', 'SECURITY EVENT')} [DEMO / SIMULATION]"
                if scenario_label:
                    alt["scenario"] = scenario_label
                if cam_zone_cfg.get("name"):
                    alt["sector"] = cam_zone_cfg["name"]

        # Combine per-person max risk score with event engine threat score
        max_person_risk = max((pt.get("risk_score", 0) for pt in enriched_person_targets), default=0)
        overall_threat_score = max(ee_result.get("threat_score", 0), max_person_risk)

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
        yolo_stat = self.yolo_detector.status()
        return {
            "camera_id": cam_id,
            "is_demo": is_demo,
            "scenario": scenario_label,
            "protected_zone": cam_zone_cfg,
            "kpis": kpis,
            "targets": enriched_person_targets,
            "vehicles": enriched_vehicle_targets,
            "tracks": all_tracks,
            "other_objects": other_objects,
            "relationships": relationships,
            "person_activity_cards": [pt["activity_card"] for pt in enriched_person_targets if "activity_card" in pt],
            "total_faces": len(enriched_person_targets),
            "face_matches": active_face_matches,
            "anpr_events": active_anpr_results,
            "alerts": ee_result.get("alerts", []),
            "events": ee_result.get("events", []),
            "ai_alerts": ee_result.get("alerts", []),
            "ai_events": ee_result.get("events", []),
            "threat_score": overall_threat_score,
            "contributing_signals": (
                enriched_person_targets[0].get("contributing_signals", [])
                if enriched_person_targets else ee_result.get("contributing_signals", [])
            ),
            "threat_reasons": (
                enriched_person_targets[0].get("reasons", [])
                if enriched_person_targets else ee_result.get("reasons", [])
            ),
            "high_threat_count": sum(1 for a in ee_result.get("alerts", []) if a.get("severity") in ("CRITICAL", "HIGH")),
            "zone_intrusions": ee_result.get("kpis", {}).get("zone_intrusions", 0),
            "loitering_count": ee_result.get("kpis", {}).get("loitering_count", 0),
            "frame_size": {"width": w, "height": h},
            "analytics_enabled": self.analytics_enabled,
            "ai_stats": {
                "yolo_status": yolo_stat["status"],
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
                "relationships_count": len(relationships),
                "total_detections": len(cached_dets),
                "weapon_detection": yolo_stat.get("weapon_detection", "NOT CONFIGURED"),
                "custom_object_detection": yolo_stat.get("custom_object_detection", "NOT CONFIGURED"),
                "structure_detection": yolo_stat.get("structure_detection", "NOT CONFIGURED"),
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
            "relationships": [],
            "person_activity_cards": [],
            "total_faces": 0,
            "face_matches": [],
            "anpr_events": [],
            "alerts": [],
            "ai_alerts": [],
            "ai_events": [],
            "threat_score": 0,
            "contributing_signals": [],
            "threat_reasons": [],
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
                "relationships_count": 0,
                "total_detections": 0,
                "weapon_detection": "NOT CONFIGURED",
                "custom_object_detection": "NOT CONFIGURED",
                "latency_ms": 0.0
            }
        }
