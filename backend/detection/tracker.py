"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Multi-Object Tracker Module
Maintains persistent track IDs for persons (P-001, P-002) and vehicles (V-001, V-002)
across video frames with direction, dwell time, and relative speed telemetry.
"""

import time
import math
import logging
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timezone
import numpy as np
from scipy.optimize import linear_sum_assignment

logger = logging.getLogger("IBVAP.Tracker")


def compute_iou(box_a: List[int], box_b: List[int]) -> float:
    """Compute Intersection over Union between two [x, y, w, h] bounding boxes."""
    ax, ay, aw, ah = box_a
    bx, by, bw, bh = box_b

    ax2, ay2 = ax + aw, ay + ah
    bx2, by2 = bx + bw, by + bh

    ix1 = max(ax, bx)
    iy1 = max(ay, by)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter_area = (ix2 - ix1) * (iy2 - iy1)
    union_area = (aw * ah) + (bw * bh) - inter_area
    if union_area <= 0:
        return 0.0
    return inter_area / union_area


def compute_direction(history: List[Tuple[float, float, float]]) -> Tuple[str, str, float]:
    """
    Computes trajectory direction, movement state, and speed from recent centroid history.
    history: list of (cx, cy, timestamp)
    
    Returns: (direction_str, movement_state, relative_speed)
    """
    if len(history) < 2:
        return "STATIONARY", "STATIONARY", 0.0

    # Look back over up to 10 points (approx 0.5 - 1 second)
    p_start = history[0]
    p_end = history[-1]

    dx = p_end[0] - p_start[0]
    dy = p_end[1] - p_start[1]
    dt = max(0.01, p_end[2] - p_start[2])

    distance = math.hypot(dx, dy)
    speed_px_sec = distance / dt

    if distance < 8.0:
        return "STATIONARY", "STATIONARY", round(speed_px_sec, 1)

    # In screen coordinates: y increases downwards
    angle = math.degrees(math.atan2(-dy, dx))  # standard polar angle (0=East, 90=North)
    if angle < 0:
        angle += 360

    if 22.5 <= angle < 67.5:
        dir_name = "NORTH-EAST"
    elif 67.5 <= angle < 112.5:
        dir_name = "NORTH"
    elif 112.5 <= angle < 157.5:
        dir_name = "NORTH-WEST"
    elif 157.5 <= angle < 202.5:
        dir_name = "WEST"
    elif 202.5 <= angle < 247.5:
        dir_name = "SOUTH-WEST"
    elif 247.5 <= angle < 292.5:
        dir_name = "SOUTH"
    elif 292.5 <= angle < 337.5:
        dir_name = "SOUTH-EAST"
    else:
        dir_name = "EAST"

    movement = "MOVING FAST" if speed_px_sec > 120 else "MOVING"
    return dir_name, movement, round(speed_px_sec, 1)


class TrackedTarget:
    """Represents a single persistent target track."""

    def __init__(
        self,
        track_id: str,
        category: str,
        class_name: str,
        bbox: List[int],
        confidence: float,
        camera_id: str,
        frame_w: int,
        frame_h: int
    ):
        self.track_id = track_id
        self.category = category
        self.class_name = class_name
        self.bbox = bbox
        self.confidence = confidence
        self.camera_id = camera_id
        self.frame_w = frame_w
        self.frame_h = frame_h

        now = time.time()
        self.first_seen_time = now
        self.last_seen_time = now
        self.first_seen_iso = datetime.now(timezone.utc).isoformat()
        self.last_seen_iso = self.first_seen_iso

        cx = bbox[0] + bbox[2] / 2.0
        cy = bbox[1] + bbox[3] / 2.0
        self.history: List[Tuple[float, float, float]] = [(cx, cy, now)]
        self.disappeared_count = 0
        self.total_frames = 1
        self.max_confidence = confidence

        # Zone telemetry
        self.current_zone = "UNRESTRICTED"
        self.in_restricted_zone = False
        self.zone_entry_time: Optional[float] = None
        self.loitering = False

    def update(self, bbox: List[int], confidence: float):
        now = time.time()
        self.bbox = bbox
        self.confidence = confidence
        self.max_confidence = max(self.max_confidence, confidence)
        self.last_seen_time = now
        self.last_seen_iso = datetime.now(timezone.utc).isoformat()
        self.disappeared_count = 0
        self.total_frames += 1

        cx = bbox[0] + bbox[2] / 2.0
        cy = bbox[1] + bbox[3] / 2.0
        self.history.append((cx, cy, now))
        if len(self.history) > 30:
            self.history.pop(0)

    def to_dict(self) -> Dict[str, Any]:
        direction, movement, speed_px_sec = compute_direction(self.history)
        dwell_seconds = round(self.last_seen_time - self.first_seen_time, 1)

        x, y, bw, bh = self.bbox
        w = max(1, self.frame_w)
        h = max(1, self.frame_h)
        normalized_box = [
            round(x / w, 4),
            round(y / h, 4),
            round(bw / w, 4),
            round(bh / h, 4)
        ]

        cx = int(x + bw / 2.0)
        cy = int(y + bh / 2.0)

        # Label physical speed clearly as relative / estimated
        speed_label = f"{speed_px_sec:.1f} px/s [RELATIVE SPEED]"

        return {
            "track_id": self.track_id,
            "category": self.category,
            "class_name": self.class_name,
            "confidence": round(self.confidence, 3),
            "confidence_pct": round(self.confidence * 100, 1) if self.confidence <= 1.0 else round(self.confidence, 1),
            "bbox": self.bbox,
            "normalized_box": normalized_box,
            "center": (cx, cy),
            "camera_id": self.camera_id,
            "direction": direction,
            "movement": movement,
            "relative_speed": speed_px_sec,
            "speed_label": speed_label,
            "dwell_seconds": dwell_seconds,
            "first_seen": self.first_seen_iso,
            "last_seen": self.last_seen_iso,
            "total_frames": self.total_frames,
            "in_restricted_zone": self.in_restricted_zone,
            "loitering": self.loitering,
            "current_zone": self.current_zone
        }


class MultiObjectTracker:
    """
    Lightweight, high-performance Multi-Object Tracker.
    
    Assigns and maintains stable:
      - 'P-001', 'P-002', 'P-003' for Persons
      - 'V-001', 'V-002', 'V-003' for Vehicles
    
    Uses Hungarian algorithm with IoU and spatial proximity fallback.
    """

    def __init__(
        self,
        max_disappeared: int = 25,
        iou_threshold: float = 0.25,
        max_age: Optional[int] = None,
        min_hits: Optional[int] = None,
        **kwargs
    ):
        self.max_disappeared = max_age if max_age is not None else max_disappeared
        self.iou_threshold = iou_threshold

        self.next_person_id = 1
        self.next_vehicle_id = 1

        self.tracks: Dict[str, TrackedTarget] = {}

    def _allocate_id(self, category: str) -> str:
        if category == "person":
            tid = f"P-{self.next_person_id:03d}"
            self.next_person_id += 1
            return tid
        else:
            tid = f"V-{self.next_vehicle_id:03d}"
            self.next_vehicle_id += 1
            return tid

    def update(
        self,
        detections: List[Dict[str, Any]],
        frame_shape: Tuple[int, int],
        camera_id: str = "CAM-01"
    ) -> List[Dict[str, Any]]:
        """
        Updates tracked targets with new frame detections.
        Returns list of active tracked target dictionaries.
        """
        h, w = frame_shape[:2]

        # Ensure category is populated on all detections
        for d in detections:
            if "category" not in d:
                cname = d.get("class_name", "").lower()
                if cname == "person":
                    d["category"] = "person"
                elif cname in ["car", "truck", "bus", "motorcycle", "bicycle"]:
                    d["category"] = "vehicle"
                else:
                    d["category"] = "other"

        # Separate detections by category to prevent person-vehicle ID cross-over
        person_dets = [d for d in detections if d.get("category") == "person"]
        vehicle_dets = [d for d in detections if d.get("category") == "vehicle"]

        self._update_category("person", person_dets, w, h, camera_id)
        self._update_category("vehicle", vehicle_dets, w, h, camera_id)

        # Remove dead tracks
        dead_ids = [
            tid for tid, trk in self.tracks.items()
            if trk.disappeared_count > self.max_disappeared
        ]
        for tid in dead_ids:
            del self.tracks[tid]

        # Return all active tracks currently visible (disappeared_count == 0)
        active_results = [
            trk.to_dict() for trk in self.tracks.values()
            if trk.disappeared_count == 0
        ]
        return active_results

    def _update_category(
        self,
        category: str,
        category_detections: List[Dict[str, Any]],
        frame_w: int,
        frame_h: int,
        camera_id: str
    ):
        existing_ids = [
            tid for tid, trk in self.tracks.items()
            if trk.category == category
        ]

        if not category_detections:
            for tid in existing_ids:
                self.tracks[tid].disappeared_count += 1
            return

        if not existing_ids:
            # Register all as new tracks
            for det in category_detections:
                tid = self._allocate_id(category)
                self.tracks[tid] = TrackedTarget(
                    track_id=tid,
                    category=category,
                    class_name=det.get("class_name") or det.get("class") or category,
                    bbox=det["bbox"],
                    confidence=det.get("confidence", 0.5),
                    camera_id=camera_id,
                    frame_w=frame_w,
                    frame_h=frame_h
                )
            return

        # Build Cost Matrix (1.0 - IoU)
        n_existing = len(existing_ids)
        n_dets = len(category_detections)
        cost_matrix = np.ones((n_existing, n_dets), dtype=np.float32)

        for i, tid in enumerate(existing_ids):
            trk_box = self.tracks[tid].bbox
            for j, det in enumerate(category_detections):
                iou = compute_iou(trk_box, det["bbox"])
                if iou > 0:
                    cost_matrix[i, j] = 1.0 - iou
                else:
                    # Spatial proximity fallback if IoU is zero
                    tcx = trk_box[0] + trk_box[2] / 2.0
                    tcy = trk_box[1] + trk_box[3] / 2.0
                    dcx = det["bbox"][0] + det["bbox"][2] / 2.0
                    dcy = det["bbox"][1] + det["bbox"][3] / 2.0
                    dist = math.hypot(tcx - dcx, tcy - dcy)
                    max_dim = max(frame_w, frame_h)
                    # Normalize distance cost: 1.0 to 2.0
                    cost_matrix[i, j] = min(2.0, 1.0 + (dist / max_dim))

        row_indices, col_indices = linear_sum_assignment(cost_matrix)

        assigned_existing = set()
        assigned_dets = set()

        for r, c in zip(row_indices, col_indices):
            cost = cost_matrix[r, c]
            # If cost > 1.0 - iou_threshold AND distance is too far (> 120px)
            if cost > (1.0 - self.iou_threshold) and cost > 1.15:
                continue

            tid = existing_ids[r]
            det = category_detections[c]
            self.tracks[tid].update(det["bbox"], det.get("confidence", 0.5))
            self.tracks[tid].class_name = det.get("class", self.tracks[tid].class_name)

            assigned_existing.add(r)
            assigned_dets.add(c)

        # Increment disappeared count for unmatched existing tracks
        for i, tid in enumerate(existing_ids):
            if i not in assigned_existing:
                self.tracks[tid].disappeared_count += 1

        # Register new tracks for unmatched detections
        for j, det in enumerate(category_detections):
            if j not in assigned_dets:
                tid = self._allocate_id(category)
                self.tracks[tid] = TrackedTarget(
                    track_id=tid,
                    category=category,
                    class_name=det.get("class_name") or det.get("class") or category,
                    bbox=det["bbox"],
                    confidence=det.get("confidence", 0.5),
                    camera_id=camera_id,
                    frame_w=frame_w,
                    frame_h=frame_h
                )

    def reset(self):
        """Clears all tracking state."""
        self.tracks.clear()
        self.next_person_id = 1
        self.next_vehicle_id = 1
