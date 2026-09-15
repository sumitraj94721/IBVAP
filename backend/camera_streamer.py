"""
AI Border Surveillance CCTV Command Center (SIH 26187)
Native OpenCV Camera Streamer & Hardware Ingestion
"""

import cv2
import threading
import time
import logging
from typing import Callable, List, Dict, Optional, Tuple, Any

logger = logging.getLogger("IBVAP.CameraStreamer")


class OpenCVCameraStreamer:
    """
    Thread-safe OpenCV camera capture with buffer clearing for zero-latency streaming.
    """

    def __init__(self, camera_index: int = 0, width: int = 1280, height: int = 720):
        self.camera_index = camera_index
        self.requested_width = width
        self.requested_height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self.current_frame = None
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

    def start(self) -> bool:
        if self.is_running:
            return True

        logger.info(f"Opening camera index {self.camera_index} via OpenCV...")
        # Use DirectShow on Windows for fastest camera initialization
        self.cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
        if not self.cap.isOpened():
            # Fallback to standard backend
            self.cap = cv2.VideoCapture(self.camera_index)

        if not self.cap.isOpened():
            logger.warning(f"Could not open camera {self.camera_index}")
            return False

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.requested_width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.requested_height)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        self.is_running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
        logger.info(f"Camera streamer {self.camera_index} started successfully.")
        return True

    def _capture_loop(self):
        while self.is_running and self.cap and self.cap.isOpened():
            ret, frame = self.cap.read()
            if not ret or frame is None:
                time.sleep(0.01)
                continue
            with self.lock:
                self.current_frame = frame
        logger.info("Camera capture loop stopped.")

    def get_latest_frame(self):
        with self.lock:
            if self.current_frame is None:
                return None
            return self.current_frame.copy()

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
            self.cap = None
        logger.info("Camera streamer stopped.")

    @staticmethod
    def list_available_cameras(max_tested: int = 4) -> List[Dict[str, Any]]:
        """
        Scans available local camera indexes.
        """
        available = []
        for index in range(max_tested):
            cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
            if cap.isOpened():
                ret, _ = cap.read()
                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                available.append({
                    "id": f"opencv_{index}",
                    "index": index,
                    "label": f"Local Camera #{index} ({w}x{h})" if ret else f"Local Camera #{index}",
                    "width": w,
                    "height": h
                })
                cap.release()
        return available


class RemoteCameraStreamer:
    """Reconnectable OpenCV capture for an MJPEG/RTSP edge-camera URL."""

    def __init__(self, stream_url: str, on_frame: Optional[Callable[[Any], None]] = None):
        self.stream_url = stream_url
        self.on_frame = on_frame
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self.current_frame = None
        self.last_frame_at = 0.0
        self.fps = 0.0
        self._fps_started_at = 0.0
        self._fps_frame_count = 0
        self.last_error = ""
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

    def start(self) -> bool:
        if self.is_running:
            return True
        if not self.stream_url:
            self.last_error = "CAM2_STREAM_URL is not configured"
            return False
        self.is_running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
        return True

    def _capture_loop(self):
        while self.is_running:
            capture = cv2.VideoCapture(self.stream_url)
            self.cap = capture
            if not capture.isOpened():
                self.last_error = "Unable to connect to remote edge camera"
                capture.release()
                self.cap = None
                time.sleep(2.0)
                continue

            self.last_error = ""
            while self.is_running:
                ret, frame = capture.read()
                if not ret or frame is None:
                    self.last_error = "Remote edge camera stopped sending frames"
                    break
                with self.lock:
                    self.current_frame = frame
                    self.last_frame_at = time.time()
                    if not self._fps_started_at:
                        self._fps_started_at = self.last_frame_at
                    self._fps_frame_count += 1
                    elapsed = self.last_frame_at - self._fps_started_at
                    if elapsed >= 1.0:
                        self.fps = round(self._fps_frame_count / elapsed, 1)
                        self._fps_started_at = self.last_frame_at
                        self._fps_frame_count = 0
                if self.on_frame:
                    try:
                        self.on_frame(frame)
                    except Exception as error:
                        logger.debug("Remote frame callback failed: %s", error)

            capture.release()
            self.cap = None
            if self.is_running:
                time.sleep(2.0)

    def get_latest_frame(self):
        with self.lock:
            if self.current_frame is None:
                return None
            return self.current_frame.copy()

    def status(self) -> Dict[str, Any]:
        with self.lock:
            frame_age_ms = round((time.time() - self.last_frame_at) * 1000, 1) if self.last_frame_at else None
            frame = self.current_frame
            resolution = f"{frame.shape[1]}x{frame.shape[0]}" if frame is not None else None
        return {
            "connected": bool(frame is not None and frame_age_ms is not None and frame_age_ms < 5000),
            "stream_status": "LIVE" if frame_age_ms is not None and frame_age_ms < 5000 else "OFFLINE",
            "fps": round(self.fps),
            "resolution": resolution,
            "latency_ms": frame_age_ms,
            "error": self.last_error or None,
        }

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
            self.cap = None
