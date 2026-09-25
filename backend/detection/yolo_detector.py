"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
YOLO Object Detection Module
Supports Ultralytics YOLOv8/v11 with auto CPU/GPU fallback and normalized schema.
"""

import os
import time
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import numpy as np
import cv2

try:
    import torch
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False

try:
    from ultralytics import YOLO
    _ULTRALYTICS_AVAILABLE = True
except ImportError:
    _ULTRALYTICS_AVAILABLE = False

logger = logging.getLogger("IBVAP.YoloDetector")

# Supported surveillance target classes and category mapping
TARGET_CLASSES = {
    0: ("person", "person"),
    1: ("bicycle", "vehicle"),
    2: ("car", "vehicle"),
    3: ("motorcycle", "vehicle"),
    5: ("bus", "vehicle"),
    7: ("truck", "vehicle"),
}

DEFAULT_MODEL_NAME = os.getenv("YOLO_MODEL", "yolov8n.pt")
DEFAULT_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.40"))
DEFAULT_IMGSZ = int(os.getenv("YOLO_IMGSZ", "640"))


class YoloDetector:
    """
    Real-time Multi-Object Detector powered by Ultralytics YOLO.
    
    Detects and normalizes surveillance targets:
      - person
      - car
      - truck
      - bus
      - motorcycle
      - bicycle
    
    Supports CPU / CUDA automatic acceleration and easy ONNX substitution.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        confidence_threshold: float = DEFAULT_CONFIDENCE,
        imgsz: int = DEFAULT_IMGSZ,
        camera_id: str = "CAM-01",
        conf_thresh: Optional[float] = None,
        **kwargs
    ):
        self.camera_id = camera_id
        self.confidence_threshold = conf_thresh if conf_thresh is not None else confidence_threshold
        self.imgsz = imgsz
        self.is_ready = False
        self.model_path = model_path or DEFAULT_MODEL_NAME
        self.device = "cpu"
        self.model = None

        self._init_device()
        self._load_model()

    def _init_device(self):
        """Detects whether GPU/CUDA is available, defaulting gracefully to CPU."""
        if _TORCH_AVAILABLE and torch.cuda.is_available():
            self.device = "cuda:0"
            logger.info(f"[+] CUDA GPU acceleration detected: {torch.cuda.get_device_name(0)}")
        else:
            self.device = "cpu"
            logger.info("[*] Running YOLO detector in CPU MODE.")

    def _load_model(self):
        """Loads Ultralytics YOLO model from disk or cache."""
        if not _ULTRALYTICS_AVAILABLE:
            logger.error("[!] Ultralytics package is not installed.")
            self.is_ready = False
            return

        try:
            # Check model file path
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            models_dir_path = os.path.join(project_root, "models", self.model_path)
            
            if os.path.exists(models_dir_path):
                load_target = models_dir_path
            elif os.path.exists(self.model_path):
                load_target = self.model_path
            else:
                load_target = self.model_path  # Will auto-download via Ultralytics if recognized name

            logger.info(f"[*] Loading YOLO model: {load_target} on {self.device} ...")
            self.model = YOLO(load_target)
            self.is_ready = True
            logger.info(f"[+] YOLO detector loaded successfully. Classes: {len(self.model.names)}")
        except Exception as e:
            logger.error(f"[!] Failed to load YOLO model: {e}")
            self.is_ready = False

    def detect(
        self,
        frame_bgr: np.ndarray,
        confidence_threshold: Optional[float] = None,
        camera_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Run inference on a single BGR video frame.
        
        Returns a list of normalized target detections:
        [
          {
            "class": "person",
            "category": "person",
            "confidence": 0.94,
            "confidence_pct": 94.0,
            "bbox": [x, y, w, h],
            "normalized_box": [nx, ny, nw, nh],
            "center": (cx, cy),
            "camera_id": "BOP-01",
            "timestamp": "2026-09-25T06:30:00Z"
          },
          ...
        ]
        """
        if not self.is_ready or self.model is None or frame_bgr is None or frame_bgr.size == 0:
            return []

        h, w = frame_bgr.shape[:2]
        conf_thresh = confidence_threshold if confidence_threshold is not None else self.confidence_threshold
        cam_id = camera_id or self.camera_id
        timestamp = datetime.now(timezone.utc).isoformat()

        try:
            # Perform inference
            results = self.model.predict(
                source=frame_bgr,
                conf=conf_thresh,
                imgsz=self.imgsz,
                device=self.device,
                verbose=False,
                classes=list(TARGET_CLASSES.keys())
            )

            detections = []
            if not results or len(results) == 0:
                return detections

            result = results[0]
            boxes = result.boxes

            if boxes is None or len(boxes) == 0:
                return detections

            for box in boxes:
                cls_id = int(box.cls[0].item())
                if cls_id not in TARGET_CLASSES:
                    continue

                class_name, category = TARGET_CLASSES[cls_id]
                conf = float(box.conf[0].item())
                xyxy = box.xyxy[0].cpu().numpy()

                x1, y1, x2, y2 = xyxy
                # Clamp within frame boundaries
                x1 = max(0, min(int(x1), w - 1))
                y1 = max(0, min(int(y1), h - 1))
                x2 = max(0, min(int(x2), w))
                y2 = max(0, min(int(y2), h))

                bw = x2 - x1
                bh = y2 - y1

                if bw < 4 or bh < 4:
                    continue

                cx = int(x1 + bw / 2.0)
                cy = int(y1 + bh / 2.0)

                normalized_box = [
                    round(x1 / w, 4),
                    round(y1 / h, 4),
                    round(bw / w, 4),
                    round(bh / h, 4)
                ]

                detections.append({
                    "class": class_name,
                    "category": category,
                    "confidence": round(conf, 3),
                    "confidence_pct": round(conf * 100, 1),
                    "bbox": [x1, y1, bw, bh],
                    "normalized_box": normalized_box,
                    "center": (cx, cy),
                    "camera_id": cam_id,
                    "timestamp": timestamp
                })

            return detections

        except Exception as e:
            logger.error(f"[!] YOLO inference error: {e}")
            return []

    def status(self) -> Dict[str, Any]:
        """Returns runtime status of detector."""
        return {
            "status": "ONLINE" if self.is_ready else "OFFLINE",
            "model": self.model_path,
            "device": self.device,
            "confidence_threshold": self.confidence_threshold,
            "classes": [info[0] for info in TARGET_CLASSES.values()]
        }
