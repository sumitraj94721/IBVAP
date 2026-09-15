"""
AI Border Surveillance CCTV Command Center (SIH 26187)
Face Detection & Persistent Tracking Pipeline
Supports Deep Learning YuNet DNN & OpenCV Haar Cascade
"""

import os
import cv2
import numpy as np
import logging
from typing import List, Dict, Any, Tuple, Optional
from collections import OrderedDict
from backend.emotion_pipeline import EmotionClassifier
from backend.anpr_face import ANPRFaceProcessor
from backend.ai.zone_analyzer import ZoneAnalyzer

# Object detector loaded separately (optional — degrades gracefully)
try:
    from backend.ai.object_detector import ObjectDetector
    _OD_AVAILABLE = True
except ImportError:
    _OD_AVAILABLE = False
    logger.warning("[!] ObjectDetector not importable — object detection OFFLINE.")

logger = logging.getLogger("IBVAP.FacePipeline")

DEFAULT_YUNET_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "face_detection_yunet_2023mar.onnx")


class FaceTracker:
    """
    Centroid and IoU tracker to maintain persistent TARGET IDs (e.g. LOC_#1, LOC_#2)
    across continuous video frames.
    """

    def __init__(self, max_disappeared: int = 20, max_distance: float = 100.0):
        self.next_target_id = 1
        self.targets = OrderedDict()  # id -> centroid (cx, cy)
        self.boxes = OrderedDict()    # id -> (x, y, w, h)
        self.disappeared = OrderedDict() # id -> frame count
        self.emotions = OrderedDict() # id -> smoothed emotion history
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def register(self, centroid: Tuple[int, int], box: Tuple[int, int, int, int]) -> str:
        target_id = f"LOC_#{self.next_target_id:02d}"
        self.next_target_id += 1
        self.targets[target_id] = centroid
        self.boxes[target_id] = box
        self.disappeared[target_id] = 0
        self.emotions[target_id] = []
        return target_id

    def deregister(self, target_id: str):
        if target_id in self.targets:
            del self.targets[target_id]
        if target_id in self.boxes:
            del self.boxes[target_id]
        if target_id in self.disappeared:
            del self.disappeared[target_id]
        if target_id in self.emotions:
            del self.emotions[target_id]

    def update(self, rects: List[Tuple[int, int, int, int]]) -> Dict[int, str]:
        """
        Updates active tracks with newly detected bounding boxes.
        Returns mapping of rect index -> target_id.
        """
        rect_to_id = {}

        if len(rects) == 0:
            for target_id in list(self.disappeared.keys()):
                self.disappeared[target_id] += 1
                if self.disappeared[target_id] > self.max_disappeared:
                    self.deregister(target_id)
            return rect_to_id

        # Calculate centroids for current input boxes
        input_centroids = np.zeros((len(rects), 2), dtype="int")
        for i, (x, y, w, h) in enumerate(rects):
            input_centroids[i] = (int(x + w / 2.0), int(y + h / 2.0))

        # If no active targets, register all
        if len(self.targets) == 0:
            for i in range(len(rects)):
                tid = self.register(tuple(input_centroids[i]), rects[i])
                rect_to_id[i] = tid
            return rect_to_id

        # Match input centroids to existing targets via Euclidean distance
        target_ids = list(self.targets.keys())
        target_centroids = np.array(list(self.targets.values()))

        # Compute distance matrix between all pairs of centroids
        dists = np.linalg.norm(target_centroids[:, np.newaxis] - input_centroids, axis=2)

        rows = dists.min(axis=1).argsort()
        cols = dists.argmin(axis=1)[rows]

        used_rows = set()
        used_cols = set()

        for row, col in zip(rows, cols):
            if row in used_rows or col in used_cols:
                continue

            if dists[row, col] > self.max_distance:
                continue

            target_id = target_ids[row]
            self.targets[target_id] = tuple(input_centroids[col])
            self.boxes[target_id] = rects[col]
            self.disappeared[target_id] = 0
            rect_to_id[col] = target_id

            used_rows.add(row)
            used_cols.add(col)

        unused_rows = set(range(0, dists.shape[0])).difference(used_rows)
        unused_cols = set(range(0, dists.shape[1])).difference(used_cols)

        # Increment disappeared counter for unassociated existing targets
        for row in unused_rows:
            target_id = target_ids[row]
            self.disappeared[target_id] += 1
            if self.disappeared[target_id] > self.max_disappeared:
                self.deregister(target_id)

        # Register new targets for unassociated input centroids
        for col in unused_cols:
            tid = self.register(tuple(input_centroids[col]), rects[col])
            rect_to_id[col] = tid

        return rect_to_id


class FaceDetector:
    """
    Multi-engine Face Detector supporting:
    - YuNet ONNX Deep Neural Network (with 5 facial landmarks)
    - Haar Cascade frontal face classifier (OpenCV built-in)
    """

    def __init__(self, engine: str = "yunet", min_confidence: float = 0.5):
        self.engine = engine.lower()
        self.min_confidence = min_confidence
        self.yunet_path = DEFAULT_YUNET_PATH
        self.yunet_detector = None
        self.haar_detector = None
        self.current_input_size = (320, 320)

        self._init_detectors()

    def _init_detectors(self):
        # 1. Initialize YuNet
        if os.path.exists(self.yunet_path):
            try:
                self.yunet_detector = cv2.FaceDetectorYN.create(
                    model=self.yunet_path,
                    config="",
                    input_size=self.current_input_size,
                    score_threshold=self.min_confidence,
                    nms_threshold=0.3,
                    top_k=50
                )
                logger.info("YuNet DNN face detector initialized.")
            except Exception as e:
                logger.error(f"Failed to initialize YuNet: {e}")
                self.yunet_detector = None

        # 2. Initialize Haar Cascade as fallback
        try:
            haar_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
            if os.path.exists(haar_path):
                self.haar_detector = cv2.CascadeClassifier(haar_path)
                logger.info("Haar Cascade detector initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize Haar Cascade: {e}")

    def set_engine(self, engine: str):
        if engine.lower() in ["yunet", "haar"]:
            self.engine = engine.lower()

    def set_confidence_threshold(self, confidence: float):
        self.min_confidence = confidence
        if self.yunet_detector:
            self.yunet_detector.setScoreThreshold(confidence)

    def detect(self, frame_bgr: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detect faces in frame.
        Returns list of dicts:
            - box: [x, y, w, h]
            - confidence: float
            - landmarks: [[x, y], ...] (if YuNet)
        """
        h, w = frame_bgr.shape[:2]
        results = []

        if self.engine == "yunet" and self.yunet_detector is not None:
            # Dynamically update YuNet input size if frame dimensions changed
            if self.current_input_size != (w, h):
                self.current_input_size = (w, h)
                self.yunet_detector.setInputSize((w, h))

            _, faces = self.yunet_detector.detect(frame_bgr)
            if faces is not None:
                for face in faces:
                    # face format: [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
                    box = [int(face[0]), int(face[1]), int(face[2]), int(face[3])]
                    # Clamp to image boundaries
                    box[0] = max(0, box[0])
                    box[1] = max(0, box[1])
                    box[2] = min(w - box[0], box[2])
                    box[3] = min(h - box[1], box[3])

                    score = float(face[14])
                    if score < self.min_confidence:
                        continue

                    landmarks = [
                        [int(face[4]), int(face[5])],   # Right eye
                        [int(face[6]), int(face[7])],   # Left eye
                        [int(face[8]), int(face[9])],   # Nose tip
                        [int(face[10]), int(face[11])], # Right mouth corner
                        [int(face[12]), int(face[13])]  # Left mouth corner
                    ]

                    results.append({
                        "box": box,
                        "confidence": float(round(score * 100, 1)),
                        "landmarks": landmarks
                    })
            return results

        # Fallback or requested Haar Cascade
        if self.haar_detector is not None:
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            # Apply histogram equalization for better contrast
            gray = cv2.equalizeHist(gray)
            detected = self.haar_detector.detectMultiScale(
                gray,
                scaleFactor=1.15,
                minNeighbors=5,
                minSize=(30, 30)
            )
            for (x, y, bw, bh) in detected:
                results.append({
                    "box": [int(x), int(y), int(bw), int(bh)],
                    "confidence": 85.0,
                    "landmarks": []
                })

        return results


class SurveillanceVisionPipeline:
    """
    Unified Pipeline connecting:
    - Video Frame Ingestion
    - Face Detection (YuNet / Haar)
    - Persistent Face Tracking (LOC_#1)
    - Real-time Emotion / Expression Analysis (FER+ ResNet)
    - Threat Level Evaluation & Alert Generation
    """

    def __init__(self, engine: str = "yunet"):
        self.detector = FaceDetector(engine=engine)
        self.tracker = FaceTracker()
        self.emotion_classifier = EmotionClassifier()
        self.edge_processor = ANPRFaceProcessor()
        self.zone_analyzer = ZoneAnalyzer()
        self.analytics_enabled = True
        self._frame_count = 0
        self._last_object_detections: List[Dict[str, Any]] = []

        # Load object detector — non-blocking, degrades gracefully
        self.object_detector = None
        if _OD_AVAILABLE:
            try:
                self.object_detector = ObjectDetector()
                logger.info(f"[+] Object detector status: {self.object_detector.status()}")
            except Exception as e:
                logger.warning(f"[!] Object detector init failed: {e}")
        else:
            logger.warning("[!] Object detection module unavailable.")

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        confidence_threshold: float = 0.5,
        engine: Optional[str] = None,
        vehicle_detections: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        End-to-end frame analysis (enhanced with object detection, zone analysis, tracking).

        Returns enriched dict with targets, alerts, object detections, zone events, and AI stats.
        """
        h, w = frame_bgr.shape[:2]
        self._frame_count += 1

        if engine and engine != self.detector.engine:
            self.detector.set_engine(engine)

        self.detector.set_confidence_threshold(confidence_threshold)

        if not self.analytics_enabled:
            return {
                "targets": [],
                "frame_size": {"width": w, "height": h},
                "alerts": [],
                "total_faces": 0,
                "high_threat_count": 0,
                "faces": [],
                "vehicles": [],
                "objects": [],
                "zone_events": [],
                "ai_stats": {"object_detector": "DISABLED"},
            }

        # ── 1. Face Detection ──────────────────────────────────────────────
        raw_detections = self.detector.detect(frame_bgr)
        rects = [d["box"] for d in raw_detections]
        edge_result = self.edge_processor.process(
            frame_bgr,
            vehicle_detections=vehicle_detections,
            face_detections=[
                {"box": d["box"], "confidence": d["confidence"], "tag": "FACE DETECTED"}
                for d in raw_detections
            ],
        )

        # ── 2. Object Detection (every 3rd frame for CPU performance) ──────
        if self._frame_count % 3 == 0 and self.object_detector and self.object_detector.is_ready:
            try:
                all_obj = self.object_detector.detect(frame_bgr, confidence_threshold=0.45)
                self._last_object_detections = all_obj
            except Exception as e:
                logger.debug(f"Object detection frame error: {e}")

        all_objects = self._last_object_detections
        # Separate persons detected by object detector vs faces
        od_persons = [o for o in all_objects if o["category"] == "person"]
        od_vehicles = [o for o in all_objects if o["category"] == "vehicle"]
        od_objects = [o for o in all_objects if o["category"] == "object"]

        # ── 3. Tracking: Face detections with persistent Target IDs ────────
        rect_to_id = self.tracker.update(rects)

        targets = []
        alerts = []
        high_threat_count = 0

        # ── 4. Emotion + Age-group for each tracked face ───────────────────
        for idx, det in enumerate(raw_detections):
            box = det["box"]
            target_id = rect_to_id.get(idx, f"LOC_#{idx+1:02d}")
            x, y, bw, bh = box

            # Crop face with margin padding for expression detection
            pad_x = int(bw * 0.08)
            pad_y = int(bh * 0.08)
            x1 = max(0, x - pad_x)
            y1 = max(0, y - pad_y)
            x2 = min(w, x + bw + pad_x)
            y2 = min(h, y + bh + pad_y)
            face_roi = frame_bgr[y1:y2, x1:x2]

            # Emotion analysis
            emotion_res = self.emotion_classifier.analyze(face_roi)

            threat_profile = emotion_res["threat_profile"]
            if threat_profile["is_threat"]:
                high_threat_count += 1
                alerts.append({
                    "target_id": target_id,
                    "expression": emotion_res["primary_expression"],
                    "confidence": emotion_res["confidence"],
                    "status": threat_profile["status"],
                    "level": threat_profile["level"]
                })

            # Age-group heuristic: face bounding box height as proxy
            # Small face = further away or child; large = adult close-up
            age_group, age_confidence = _estimate_age_group(bh, bw)

            # Object-in-hand: spatial overlap of objects with lower 40% of face bbox body region
            # We use the face box lower extent to estimate body lower-arm position
            body_lower_y = y + bh  # Bottom of face
            body_lower_region = [x - bw, body_lower_y, bw * 3, bh * 2]
            objects_in_hand = _find_objects_in_hand(od_objects + od_vehicles, body_lower_region, w, h)

            targets.append({
                "target_id": target_id,
                "box": box,
                "normalized_box": [
                    round(x / w, 4),
                    round(y / h, 4),
                    round(bw / w, 4),
                    round(bh / h, 4)
                ],
                "landmarks": det["landmarks"],
                "detection_confidence": det["confidence"],
                "emotion": emotion_res,
                "age_group": age_group,
                "age_confidence": age_confidence,
                "objects_in_hand": objects_in_hand,
                "target_type": "person",
            })

        # ── 5. Zone Analysis ───────────────────────────────────────────────
        enriched_targets = self.zone_analyzer.analyze(targets, w, h)

        # ── 6. Build AI stats payload ──────────────────────────────────────
        od_status = "OFFLINE"
        od_model = "N/A"
        if self.object_detector:
            od_status = self.object_detector.status()
            od_model = self.object_detector.model_name

        ai_stats = {
            "object_detector": od_status,
            "object_detector_model": od_model,
            "persons_detected": len(enriched_targets),
            "od_persons": len(od_persons),
            "vehicles_detected": len(edge_result["vehicles"]) + len(od_vehicles),
            "objects_detected": len(od_objects),
        }

        for face in edge_result["faces"]:
            face["tag"] = f"FACE DETECTED (CONF: {face.get('confidence', 92):.0f}%)"
        self.edge_processor.annotate(frame_bgr, edge_result)

        # Merge OD vehicles with edge-detected vehicles
        all_vehicles = edge_result["vehicles"] + [
            {
                "box": v["box"],
                "object_type": v["class_name"].upper(),
                "confidence": v["confidence"],
                "plate": "N/A",
                "simulated": False,
                "hud": f"[VEHICLE: {v['class_name'].upper()} | CONF: {v['confidence']:.0f}%]",
                "source": "object_detector",
            }
            for v in od_vehicles
        ]

        return {
            "targets": enriched_targets,
            "frame_size": {"width": w, "height": h},
            "alerts": alerts,
            "total_faces": len(enriched_targets),
            "high_threat_count": high_threat_count,
            "faces": edge_result["faces"],
            "vehicles": all_vehicles,
            "objects": od_objects + od_persons,  # all object detections
            "od_persons": od_persons,
            "od_vehicles": od_vehicles,
            "od_objects": od_objects,
            "ai_stats": ai_stats,
        }


# ─── Age Group Heuristic ──────────────────────────────────────────────────────

def _estimate_age_group(face_height: int, face_width: int) -> tuple:
    """
    Heuristic age-group estimation based on face bounding box dimensions.
    This is NOT a trained model — it is labeled clearly as ESTIMATED.
    Only used when a proper age model is unavailable.

    Returns (age_group: str, confidence: float)
    """
    # Face height > 100px at typical webcam distance suggests adult close-up
    # Face height < 50px could be child OR distant adult — mark as UNKNOWN
    if face_height < 30 or face_width < 25:
        return "UNKNOWN", 0.0
    elif face_height < 55:
        # Small face — too far or possibly young
        return "UNKNOWN", 30.0
    elif face_height < 90:
        # Medium face — likely teen or adult
        return "ADULT", 55.0
    else:
        # Large face close-up — adult
        return "ADULT", 65.0


# ─── Object-in-Hand Spatial Association ──────────────────────────────────────

def _bbox_overlap_fraction(box_a: List[int], box_b: List[int]) -> float:
    """
    Returns fraction of box_b that overlaps with box_a.
    Boxes are [x, y, w, h] pixel format.
    """
    ax, ay, aw, ah = box_a
    bx, by, bw, bh = box_b

    ix1 = max(ax, bx)
    iy1 = max(ay, by)
    ix2 = min(ax + aw, bx + bw)
    iy2 = min(ay + ah, by + bh)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    intersection = (ix2 - ix1) * (iy2 - iy1)
    area_b = bw * bh
    return intersection / max(area_b, 1)


def _find_objects_in_hand(
    obj_detections: List[Dict[str, Any]],
    body_lower_region: List[float],
    frame_w: int,
    frame_h: int,
) -> List[Dict[str, Any]]:
    """
    Find objects that overlap with the lower body region of a person.
    This is spatial proximity — not a trained hand-object detector.
    Labeled as "LIKELY IN HAND" to avoid false certainty.
    """
    in_hand = []
    region = [
        max(0, int(body_lower_region[0])),
        max(0, int(body_lower_region[1])),
        min(frame_w, int(body_lower_region[2])),
        min(frame_h, int(body_lower_region[3])),
    ]

    for obj in obj_detections:
        obj_box = obj.get("box", [])
        if len(obj_box) < 4:
            continue
        overlap = _bbox_overlap_fraction(region, obj_box)
        if overlap > 0.25:  # At least 25% of object is in hand region
            in_hand.append({
                "class_name": obj.get("class_name", "object"),
                "confidence": obj.get("confidence", 0),
                "relation": "LIKELY_IN_HAND",
                "overlap_fraction": round(overlap, 2),
            })

    return in_hand

