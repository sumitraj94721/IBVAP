"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Phase 1: Simulated Border CCTV Stream Generator (OpenCV)
Generates high-performance, procedural border CCTV feeds with tactical telemetry.
"""

import cv2
import numpy as np
import time
import math
import threading
from typing import Dict, Optional


class BorderCameraStreamManager:
    """
    Manages procedural border surveillance feeds for:
    - CAM-02: BOP-01 Perimeter (Sector Alpha - Night Vision Fence Line)
    - CAM-03: BOP-02 Riverine (Restricted Buffer - FLIR False-Color Thermal)
    - CAM-04: BOP-03 Checkpost-Alpha (Vehicle Inspection Barrier Gate)
    """

    def __init__(self, width: int = 640, height: int = 360, fps: int = 25):
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_interval = 1.0 / fps

        self.running = False
        self.lock = threading.Lock()
        self.cached_frames: Dict[str, bytes] = {}
        self.frame_indices: Dict[str, int] = {"cam2": 0, "cam3": 0, "cam4": 0}

        # Start generator background worker
        self.start()

    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._generation_loop, daemon=True)
            self.thread.start()

    def stop(self):
        self.running = False

    def _generation_loop(self):
        while self.running:
            t_start = time.time()

            # Render each simulated camera frame
            f2 = self._render_cam2_fence(self.frame_indices["cam2"])
            f3 = self._render_cam3_riverine(self.frame_indices["cam3"])
            f4 = self._render_cam4_checkpost(self.frame_indices["cam4"])

            # Compress frames to JPEG
            _, buf2 = cv2.imencode('.jpg', f2, [cv2.IMWRITE_JPEG_QUALITY, 75])
            _, buf3 = cv2.imencode('.jpg', f3, [cv2.IMWRITE_JPEG_QUALITY, 75])
            _, buf4 = cv2.imencode('.jpg', f4, [cv2.IMWRITE_JPEG_QUALITY, 75])

            with self.lock:
                self.cached_frames["cam2"] = buf2.tobytes()
                self.cached_frames["cam3"] = buf3.tobytes()
                self.cached_frames["cam4"] = buf4.tobytes()

            self.frame_indices["cam2"] += 1
            self.frame_indices["cam3"] += 1
            self.frame_indices["cam4"] += 1

            # Regulate frame rate
            elapsed = time.time() - t_start
            sleep_time = max(0.005, self.frame_interval - elapsed)
            time.sleep(sleep_time)

    def get_frame(self, camera_id: str) -> Optional[bytes]:
        with self.lock:
            return self.cached_frames.get(camera_id)

    # -------------------------------------------------------------
    # CAM-02: BOP-01 Perimeter (Sector Alpha - Night Vision Fence)
    # -------------------------------------------------------------
    def _render_cam2_fence(self, frame_idx: int) -> np.ndarray:
        w, h = self.width, self.height
        # Dark green phosphor base
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (12, 36, 16) # BGR dark green

        # Subtle noise for night vision phosphor grain
        noise = np.random.randint(0, 22, (h, w, 3), dtype=np.uint8)
        img = cv2.add(img, noise)

        # Horizon & terrain hill line
        pts = np.array([
            [0, int(h * 0.62)],
            [int(w * 0.35), int(h * 0.58)],
            [int(w * 0.7), int(h * 0.65)],
            [w, int(h * 0.6)],
            [w, h],
            [0, h]
        ], np.int32)
        cv2.fillPoly(img, [pts], (8, 28, 12))

        # Border perimeter high-security chain-link fence
        fence_y = int(h * 0.55)
        # Vertical fence poles
        for x in range(30, w, 60):
            cv2.line(img, (x, fence_y - 40), (x, h - 20), (28, 90, 40), 2)
            # Barbwire top angled arm
            cv2.line(img, (x, fence_y - 40), (x + 12, fence_y - 58), (35, 110, 48), 2)

        # Barbed wire horizontal strands
        for strand_y in [fence_y - 55, fence_y - 48, fence_y - 42]:
            cv2.line(img, (0, strand_y), (w, strand_y), (35, 120, 50), 1)

        # Diagonal chain-link mesh lattice pattern
        for x in range(0, w + 40, 20):
            cv2.line(img, (x, fence_y - 40), (x - 80, h - 20), (20, 65, 30), 1)
            cv2.line(img, (x - 80, fence_y - 40), (x, h - 20), (20, 65, 30), 1)

        # Surveillance PTZ Spot-Sweep Beam (moving light cone)
        sweep_x = int(w * 0.5 + math.sin(frame_idx * 0.04) * (w * 0.38))
        overlay = img.copy()
        cv2.circle(overlay, (sweep_x, int(h * 0.68)), 75, (40, 160, 65), -1)
        cv2.addWeighted(overlay, 0.28, img, 0.72, 0, img)

        # Simulated patrol vehicle / sensor blip in the distance
        patrol_x = int((w * 0.2 + (frame_idx * 1.2)) % (w * 0.85))
        cv2.rectangle(img, (patrol_x, int(h * 0.57)), (patrol_x + 14, int(h * 0.57) + 6), (50, 220, 80), -1)
        # Bounding box simulation for remote target
        cv2.rectangle(img, (patrol_x - 3, int(h * 0.57) - 4), (patrol_x + 17, int(h * 0.57) + 10), (0, 255, 100), 1)
        cv2.putText(img, "PTRL-04", (patrol_x - 4, int(h * 0.57) - 7), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 255, 100), 1)

        # Optical HUD Telemetry Burn-in
        t_str = time.strftime("%Y-%m-%d %H:%M:%S") + f".{int(time.time() * 1000) % 1000:03d}"
        cv2.putText(img, "NVD-IR PHOSPHOR GEN-III", (16, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 120), 1)
        cv2.putText(img, f"BOP-01 SECTOR ALPHA | {t_str}", (16, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 120), 1)
        return img

    # -------------------------------------------------------------
    # CAM-03: BOP-02 Riverine (Restricted Buffer - FLIR Thermal)
    # -------------------------------------------------------------
    def _render_cam3_riverine(self, frame_idx: int) -> np.ndarray:
        w, h = self.width, self.height
        # Deep thermal background (blue/purple FLIR palette)
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (45, 15, 10) # BGR dark navy/indigo

        # Horizon / river bank
        river_bank_y = int(h * 0.45)
        cv2.rectangle(img, (0, 0), (w, river_bank_y), (65, 20, 15), -1)

        # Animated river water flow lines
        for i in range(12):
            y = river_bank_y + 15 + i * 16
            offset = int(math.sin((frame_idx * 0.08) + i) * 14)
            speed_shift = int((frame_idx * 2 + i * 25) % w)
            cv2.line(img, (0, y), (w, y), (85, 35, 25), 1)
            # Ripple highlights
            rx = (speed_shift + offset) % w
            cv2.line(img, (rx, y), (min(w, rx + 45), y), (140, 60, 45), 2)

        # Thermal navigation buoy / marker
        buoy_x = int(w * 0.72)
        buoy_y = int(h * 0.65 + math.sin(frame_idx * 0.06) * 4)
        # Warm core (hot white/yellow in thermal)
        cv2.circle(img, (buoy_x, buoy_y), 9, (40, 180, 255), -1) # Yellow-orange
        cv2.circle(img, (buoy_x, buoy_y), 4, (255, 255, 255), -1) # White hot

        # Moving riverine patrol boat / vessel thermal signature
        boat_x = int((w * 0.85 - (frame_idx * 1.5)) % (w + 80)) - 40
        boat_y = int(h * 0.52 + math.sin(frame_idx * 0.05) * 3)
        if -40 < boat_x < w + 20:
            # Boat hull
            boat_pts = np.array([
                [boat_x, boat_y],
                [boat_x + 35, boat_y],
                [boat_x + 42, boat_y - 6],
                [boat_x - 5, boat_y - 6]
            ], np.int32)
            cv2.fillPoly(img, [boat_pts], (60, 210, 255))
            # Cabin hot engine spot (red/white)
            cv2.rectangle(img, (boat_x + 10, boat_y - 14), (boat_x + 24, boat_y - 6), (220, 240, 255), -1)
            cv2.circle(img, (boat_x + 16, boat_y - 10), 3, (255, 255, 255), -1)
            # Water wake
            cv2.line(img, (boat_x + 38, boat_y + 1), (boat_x + 65, boat_y + 4), (160, 90, 60), 2)
            # Analytics detection target box
            cv2.rectangle(img, (boat_x - 8, boat_y - 18), (boat_x + 46, boat_y + 4), (0, 240, 255), 1)
            cv2.putText(img, "VESSEL: 91%", (boat_x - 8, boat_y - 21), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 240, 255), 1)

        # Thermal FLIR HUD Overlay
        t_str = time.strftime("%Y-%m-%d %H:%M:%S") + f".{int(time.time() * 1000) % 1000:03d}"
        cv2.putText(img, "FLIR INFRARED | PALETTE: IRONBOW", (16, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (40, 210, 255), 1)
        cv2.putText(img, f"BOP-02 RIVERINE BUFFER | {t_str}", (16, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (40, 210, 255), 1)
        return img

    # -------------------------------------------------------------
    # CAM-04: BOP-03 Checkpost-Alpha (Vehicle Barrier Inspection)
    # -------------------------------------------------------------
    def _render_cam4_checkpost(self, frame_idx: int) -> np.ndarray:
        w, h = self.width, self.height
        # High-contrast asphalt road & checkpoint shelter
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (26, 28, 32) # Dark slate

        # Road perspective polygon
        road_pts = np.array([
            [int(w * 0.28), int(h * 0.42)],
            [int(w * 0.72), int(h * 0.42)],
            [int(w * 0.95), h],
            [int(w * 0.05), h]
        ], np.int32)
        cv2.fillPoly(img, [road_pts], (42, 44, 48))

        # Road lane stripes (dashed)
        lane_x1 = int(w * 0.5)
        for y in range(int(h * 0.45), h, 35):
            y2 = min(h, y + 18)
            t = (y - int(h * 0.45)) / (h - int(h * 0.45))
            sw = int(2 + t * 4)
            cv2.line(img, (lane_x1, y), (lane_x1, y2), (200, 200, 200), sw)

        # Checkpost Guard Cabin (left side)
        cv2.rectangle(img, (int(w * 0.08), int(h * 0.28)), (int(w * 0.24), int(h * 0.65)), (55, 60, 68), -1)
        cv2.rectangle(img, (int(w * 0.08), int(h * 0.28)), (int(w * 0.24), int(h * 0.65)), (90, 100, 115), 2)
        # Cabin window with amber light
        cv2.rectangle(img, (int(w * 0.11), int(h * 0.34)), (int(w * 0.21), int(h * 0.46)), (40, 150, 230), -1)

        # Hydraulic Barrier Gate Arm (swings or stays down)
        gate_pivot_x = int(w * 0.25)
        gate_pivot_y = int(h * 0.58)
        # Barrier arm with red/white caution stripes
        gate_length = int(w * 0.38)
        gate_end_x = gate_pivot_x + gate_length
        cv2.line(img, (gate_pivot_x, gate_pivot_y), (gate_end_x, gate_pivot_y), (240, 240, 240), 6)
        # Red warning stripes on barrier
        for sx in range(gate_pivot_x + 10, gate_end_x, 24):
            cv2.line(img, (sx, gate_pivot_y - 2), (sx + 10, gate_pivot_y + 2), (40, 40, 230), 5)
        # Pivot post
        cv2.rectangle(img, (gate_pivot_x - 6, gate_pivot_y - 12), (gate_pivot_x + 6, gate_pivot_y + 24), (120, 120, 130), -1)

        # Traffic control signal light (Red / Amber)
        cv2.rectangle(img, (gate_pivot_x - 6, gate_pivot_y - 36), (gate_pivot_x + 6, gate_pivot_y - 14), (20, 20, 20), -1)
        cv2.circle(img, (gate_pivot_x, gate_pivot_y - 26), 4, (30, 30, 240), -1) # Red light glow

        # Automated License Plate / Vehicle Laser Scanner Grid (cyan animated line)
        scan_y = int(h * 0.62 + math.sin(frame_idx * 0.09) * (h * 0.18))
        scan_left = int(w * 0.28 + (scan_y - h * 0.42) * 0.4)
        scan_right = int(w * 0.72 - (scan_y - h * 0.42) * 0.4)
        cv2.line(img, (scan_left, scan_y), (scan_right, scan_y), (255, 240, 0), 1) # Tactical cyan-yellow

        # Simulated stationary vehicle waiting at checkpost
        veh_x = int(w * 0.54)
        veh_y = int(h * 0.46)
        cv2.rectangle(img, (veh_x - 22, veh_y), (veh_x + 22, veh_y + 26), (65, 70, 78), -1)
        # Headlights
        cv2.circle(img, (veh_x - 14, veh_y + 24), 3, (200, 255, 255), -1)
        cv2.circle(img, (veh_x + 14, veh_y + 24), 3, (200, 255, 255), -1)
        # OCR bounding box tag
        cv2.rectangle(img, (veh_x - 26, veh_y - 4), (veh_x + 26, veh_y + 28), (0, 240, 255), 1)
        cv2.putText(img, "VEH-INSPECT", (veh_x - 26, veh_y - 7), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 240, 255), 1)

        # Checkpost HUD Telemetry
        t_str = time.strftime("%Y-%m-%d %H:%M:%S") + f".{int(time.time() * 1000) % 1000:03d}"
        cv2.putText(img, "CHECKPOST ACCESS CONTROL | OCR SCAN: ACTIVE", (16, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 240, 255), 1)
        cv2.putText(img, f"BOP-03 CHECKPOST-ALPHA | {t_str}", (16, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 240, 255), 1)
        return img


# Global singleton instance
stream_manager = BorderCameraStreamManager()
