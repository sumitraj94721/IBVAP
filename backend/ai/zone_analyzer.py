"""
IBVAP AI Feature Upgrade — Zone Analyzer
Handles restricted zone intrusion detection, loitering, and movement direction.
"""

import time
import logging
from typing import Dict, Any, List, Optional, Tuple
from collections import defaultdict, deque

logger = logging.getLogger("IBVAP.ZoneAnalyzer")

# Default restricted zone as fraction of frame (nx, ny, nw, nh)
# Covers the center-right area — adjustable via API
DEFAULT_ZONE = {
    "id": "ZONE-ALPHA",
    "name": "SECTOR ALPHA RESTRICTED",
    "zone_type": "RESTRICTED_ZONE",
    "asset_type": "OUTPOST",
    "nx": 0.66,
    "ny": 0.16,
    "nw": 0.30,
    "nh": 0.68,
}

DEFAULT_CAMERA_ZONES: Dict[str, Dict[str, Any]] = {
    "CAM-01": DEFAULT_ZONE.copy(),
    "CAM-02": {
        "id": "ZONE-BRAVO",
        "name": "PERIMETER FENCE BRAVO",
        "zone_type": "RESTRICTED_ZONE",
        "asset_type": "GATE",
        "nx": 0.25,
        "ny": 0.22,
        "nw": 0.55,
        "nh": 0.60,
    },
    "CAM-03": {
        "id": "ZONE-BUNKER-ALPHA",
        "name": "BUNKER / OUTPOST ALPHA",
        "zone_type": "BUNKER_PROTECTED_ZONE",
        "asset_type": "BUNKER",
        "nx": 0.48,
        "ny": 0.18,
        "nw": 0.46,
        "nh": 0.68,
        "detection_mode": "CONFIGURED_PROTECTED_ZONE",
    },
    "CAM-04": {
        "id": "ZONE-APPROACH-DELTA",
        "name": "RESTRICTED APPROACH / INTRUSION AREA",
        "zone_type": "RESTRICTED_APPROACH_ZONE",
        "asset_type": "CHECKPOINT",
        "nx": 0.46,
        "ny": 0.20,
        "nw": 0.48,
        "nh": 0.68,
        "detection_mode": "CONFIGURED_PROTECTED_ZONE",
    },
}

LOITERING_THRESHOLD_SECONDS = 20  # Default dwell before loitering alert
CENTROID_HISTORY_FRAMES = 12      # Frames to track for movement direction


class ZoneAnalyzer:
    """
    Analyzes tracked targets against configurable restricted and protected bunker/asset zones.

    Per tracked target:
    - Determines if inside restricted/protected zone
    - Tracks dwell time
    - Detects loitering (dwell > threshold)
    - Estimates movement direction from centroid history
    """

    def __init__(self, loitering_threshold: float = LOITERING_THRESHOLD_SECONDS, camera_id: str = "CAM-01"):
        self.camera_id = camera_id
        default_z = DEFAULT_CAMERA_ZONES.get(camera_id, DEFAULT_ZONE).copy()
        self.zones: List[Dict[str, Any]] = [default_z]
        self.camera_zones: Dict[str, Dict[str, Any]] = {
            k: v.copy() for k, v in DEFAULT_CAMERA_ZONES.items()
        }
        self.loitering_threshold = loitering_threshold

        # Per-target state
        self._zone_entry_time: Dict[str, float] = {}   # target_id -> entry timestamp
        self._centroid_history: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=CENTROID_HISTORY_FRAMES)
        )
        self._in_zone_last: Dict[str, bool] = {}        # previous frame zone status
        self._loitering_alerted: Dict[str, float] = {}  # last loitering alert time

    def set_zone(self, zone: Dict[str, Any], camera_id: Optional[str] = None):
        """Replace the restricted/protected zone configuration."""
        cid = camera_id or zone.get("camera_id") or self.camera_id
        merged = {**self.camera_zones.get(cid, DEFAULT_ZONE), **zone}
        self.camera_zones[cid] = merged
        if cid == self.camera_id:
            self.zones = [merged]
        logger.info(f"[*] Zone updated for {cid}: {merged.get('name', 'ZONE')}")

    def get_zone_for_camera(self, camera_id: str) -> Dict[str, Any]:
        return self.camera_zones.get(camera_id, self.zones[0] if self.zones else DEFAULT_ZONE)

    def set_loitering_threshold(self, seconds: float):
        self.loitering_threshold = max(5.0, seconds)

    def _is_centroid_in_zone(
        self, cx_norm: float, cy_norm: float, zone: Dict[str, Any]
    ) -> bool:
        zx = zone["nx"]
        zy = zone["ny"]
        zw = zone["nw"]
        zh = zone["nh"]
        return zx <= cx_norm <= zx + zw and zy <= cy_norm <= zy + zh

    def _estimate_movement(self, history: deque) -> Tuple[str, str]:
        """
        Returns (movement_label, direction_label) from centroid history.
        movement_label: ENTERING | EXITING | STATIONARY | MOVING
        direction_label: NORTH | SOUTH | EAST | WEST | NE | NW | SE | SW | STATIONARY
        """
        if len(history) < 4:
            return "STATIONARY", "STATIONARY"

        # Compare oldest and newest centroids
        old = history[0]   # (cx_norm, cy_norm)
        new = history[-1]

        dx = new[0] - old[0]   # Positive = moving right (East)
        dy = new[1] - old[1]   # Positive = moving down (South)

        magnitude = (dx**2 + dy**2) ** 0.5

        if magnitude < 0.015:
            return "STATIONARY", "STATIONARY"

        # Direction from dx/dy
        if abs(dx) > abs(dy):
            direction = "EAST" if dx > 0 else "WEST"
        elif abs(dy) > abs(dx):
            direction = "SOUTH" if dy > 0 else "NORTH"
        else:
            if dx > 0 and dy < 0:
                direction = "NORTH-EAST"
            elif dx > 0 and dy > 0:
                direction = "SOUTH-EAST"
            elif dx < 0 and dy < 0:
                direction = "NORTH-WEST"
            else:
                direction = "SOUTH-WEST"

        movement = "MOVING"
        return movement, direction

    def analyze(
        self,
        targets: List[Dict[str, Any]],
        frame_width: int,
        frame_height: int,
        camera_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Analyze a list of tracked targets against zones.
        """
        now = time.time()
        enriched = []
        cid = camera_id or self.camera_id
        active_zones = [self.camera_zones[cid]] if cid in self.camera_zones else self.zones

        # Collect active target IDs for cleanup
        active_ids = {t.get("target_id", "") for t in targets}

        # Remove stale entries (targets that disappeared)
        stale = [tid for tid in self._zone_entry_time if tid not in active_ids]
        for tid in stale:
            del self._zone_entry_time[tid]
            self._in_zone_last.pop(tid, None)

        for target in targets:
            tid = target.get("target_id", "")
            nbox = target.get("normalized_box", [])

            if len(nbox) < 4:
                box = target.get("box", [])
                if len(box) == 4 and frame_width > 0 and frame_height > 0:
                    x, y, bw, bh = box
                    nbox = [
                        x / frame_width,
                        y / frame_height,
                        bw / frame_width,
                        bh / frame_height,
                    ]
                else:
                    nbox = [0.5, 0.5, 0.1, 0.2]

            nx, ny, nw, nh = nbox
            cx_norm = nx + nw / 2
            cy_norm = ny + nh / 2

            # Update centroid history
            self._centroid_history[tid].append((cx_norm, cy_norm))

            # Movement direction
            movement, direction = self._estimate_movement(self._centroid_history[tid])

            # Zone check
            in_zone = False
            zone_name = None
            zone_type = "RESTRICTED_ZONE"
            asset_type = "OUTPOST"
            for zone in active_zones:
                if self._is_centroid_in_zone(cx_norm, cy_norm, zone):
                    in_zone = True
                    zone_name = zone.get("name", "RESTRICTED ZONE")
                    zone_type = zone.get("zone_type", "RESTRICTED_ZONE")
                    asset_type = zone.get("asset_type", "OUTPOST")
                    break

            # Track dwell time
            if in_zone:
                if tid not in self._zone_entry_time:
                    self._zone_entry_time[tid] = now
                    logger.info(f"[*] Target {tid} entered zone on {cid}: {zone_name}")
                dwell = now - self._zone_entry_time[tid]
            else:
                if tid in self._zone_entry_time:
                    del self._zone_entry_time[tid]
                    logger.info(f"[*] Target {tid} exited zone on {cid}.")
                dwell = 0.0

            # Determine zone event type
            zone_event = None
            if in_zone:
                if dwell >= self.loitering_threshold:
                    zone_event = "LOITERING"
                elif zone_type in ("BUNKER_PROTECTED_ZONE", "RESTRICTED_APPROACH_ZONE"):
                    zone_event = "PROTECTED_AREA_INTRUSION"
                else:
                    zone_event = "INTRUSION"

            # Update movement label when in/out of zone
            was_in_zone = self._in_zone_last.get(tid, False)
            if in_zone and not was_in_zone:
                movement = "ENTERING"
            elif not in_zone and was_in_zone:
                movement = "EXITING"

            self._in_zone_last[tid] = in_zone

            enriched.append({
                **target,
                "in_restricted_zone": in_zone,
                "zone_name": zone_name,
                "zone_type": zone_type if in_zone else None,
                "asset_type": asset_type if in_zone else None,
                "dwell_seconds": round(dwell, 1),
                "loitering": zone_event == "LOITERING",
                "movement": movement,
                "direction": direction,
                "zone_event": zone_event,
            })

        return enriched
