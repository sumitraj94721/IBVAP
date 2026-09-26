"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
YOLO Object Detection Module - Expanded to all 80 COCO classes
Supports Ultralytics YOLOv8/v11 with auto CPU/GPU fallback and normalized schema.
"""

import os
import time
import logging
from typing import List, Dict, Any, Optional
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

# All 80 COCO classes with surveillance category mapping
TARGET_CLASSES = {
    0: ("person", "person"),
    1: ("bicycle", "vehicle"),
    2: ("car", "vehicle"),
    3: ("motorcycle", "vehicle"),
    4: ("airplane", "vehicle"),
    5: ("bus", "vehicle"),
    6: ("train", "vehicle"),
    7: ("truck", "vehicle"),
    8: ("boat", "vehicle"),
    9: ("traffic light", "object"),
    10: ("fire hydrant", "object"),
    11: ("stop sign", "object"),
    12: ("parking meter", "object"),
    13: ("bench", "furniture"),
    14: ("bird", "animal"),
    15: ("cat", "animal"),
    16: ("dog", "animal"),
    17: ("horse", "animal"),
    18: ("sheep", "animal"),
    19: ("cow", "animal"),
    20: ("elephant", "animal"),
    21: ("bear", "animal"),
    22: ("zebra", "animal"),
    23: ("giraffe", "animal"),
    24: ("backpack", "object"),
    25: ("umbrella", "object"),
    26: ("handbag", "object"),
    27: ("tie", "object"),
    28: ("suitcase", "object"),
    29: ("frisbee", "sports"),
    30: ("skis", "sports"),
    31: ("snowboard", "sports"),
    32: ("sports ball", "sports"),
    33: ("kite", "sports"),
    34: ("baseball bat", "object"),
    35: ("baseball glove", "sports"),
    36: ("skateboard", "sports"),
    37: ("surfboard", "sports"),
    38: ("tennis racket", "sports"),
    39: ("bottle", "object"),
    40: ("wine glass", "object"),
    41: ("cup", "object"),
    42: ("fork", "object"),
    43: ("knife", "object"),
    44: ("spoon", "object"),
    45: ("bowl", "object"),
    46: ("banana", "food"),
    47: ("apple", "food"),
    48: ("sandwich", "food"),
    49: ("orange", "food"),
    50: ("broccoli", "food"),
    51: ("carrot", "food"),
    52: ("hot dog", "food"),
    53: ("pizza", "food"),
    54: ("donut", "food"),
    55: ("cake", "food"),
    56: ("chair", "furniture"),
    57: ("couch", "furniture"),
    58: ("potted plant", "object"),
    59: ("bed", "furniture"),
    60: ("dining table", "furniture"),
    61: ("toilet", "appliance"),
    62: ("tv", "electronic"),
    63: ("laptop", "electronic"),
    64: ("mouse", "electronic"),
    65: ("remote", "electronic"),
    66: ("keyboard", "electronic"),
    67: ("cell phone", "electronic"),
    68: ("microwave", "appliance"),
    69: ("oven", "appliance"),
    70: ("toaster", "appliance"),
    71: ("sink", "appliance"),
    72: ("refrigerator", "appliance"),
    73: ("book", "object"),
    74: ("clock", "object"),
    75: ("vase", "object"),
    76: ("scissors", "object"),
    77: ("teddy bear", "object"),
    78: ("hair drier", "appliance"),
    79: ("toothbrush", "object"),
}

# Baseline risk classification per object category (before context/zone rules)
OBJECT_RISK = {
    "person": "MONITORED",
    "vehicle": "MONITORED",
    "animal": "NORMAL",
    "object": "NORMAL",
    "electronic": "NORMAL",
    "sports": "NORMAL",
    "food": "NORMAL",
    "furniture": "NORMAL",
    "appliance": "NORMAL",
    "indoor": "NORMAL",
}

# Objects tracked with MONITORED status (never classified as dangerous without context/zone rule)
MONITORED_OBJECTS = {"backpack", "suitcase", "handbag"}

DEFAULT_MODEL_NAME = os.getenv("YOLO_MODEL", "yolov8n.pt")
DEFAULT_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.40"))
DEFAULT_IMGSZ = int(os.getenv("YOLO_IMGSZ", "640"))
WEAPON_MODEL_PATH = os.getenv("WEAPON_MODEL_PATH", "").strip()
CUSTOM_OBJECT_MODEL_PATH = os.getenv("CUSTOM_OBJECT_MODEL_PATH", "").strip()


class YoloDetector:
    """
    Real-time Multi-Object Detector powered by Ultralytics YOLO.

    Detects all 80 COCO classes with risk classification:
      - person, bicycle, car, truck, bus, motorcycle, boat, airplane, train
      - backpack, umbrella, handbag, suitcase, bottle, cup, etc.
      - laptop, cell phone, keyboard, mouse, tv, book, chair, clock, scissors

    Custom object model (e.g., pen, radio, tactical gear): Configurable via
    CUSTOM_OBJECT_MODEL_PATH; never fabricates unsupported classes when not loaded.
    Weapon detection: Configurable via WEAPON_MODEL_PATH; defaults to
    NOT CONFIGURED when no dedicated weapon model is present.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        confidence_threshold: float = DEFAULT_CONFIDENCE,
        imgsz: int = DEFAULT_IMGSZ,
        camera_id: str = "CAM-01",
        conf_thresh: Optional[float] = None,
        weapon_model_path: Optional[str] = None,
        custom_object_model_path: Optional[str] = None,
        **kwargs
    ):
        self.camera_id = camera_id
        self.confidence_threshold = conf_thresh if conf_thresh is not None else confidence_threshold
        self.imgsz = imgsz
        self.is_ready = False
        self.model_path = model_path or DEFAULT_MODEL_NAME
        self.weapon_model_path = (weapon_model_path or WEAPON_MODEL_PATH).strip()
        self.weapon_model = None
        self.weapon_ready = False
        self.custom_object_model_path = (custom_object_model_path or CUSTOM_OBJECT_MODEL_PATH).strip()
        self.custom_object_model = None
        self.custom_object_ready = False
        self.device = "cpu"
        self.model = None

        self._init_device()
        self._load_model()
        self._load_optional_models()

    def _init_device(self):
        """Detects whether GPU/CUDA is available, defaulting gracefully to CPU."""
        if _TORCH_AVAILABLE and torch.cuda.is_available():
            self.device = "cuda:0"
            logger.info(f"[+] CUDA GPU acceleration detected: {torch.cuda.get_device_name(0)}")
        else:
            self.device = "cpu"
            logger.info("[*] Running YOLO detector in CPU MODE.")

    def _load_optional_models(self):
        """Loads optional specialized weapon or custom everyday object YOLO models if configured."""
        if not _ULTRALYTICS_AVAILABLE:
            return
        if self.weapon_model_path and os.path.exists(self.weapon_model_path):
            try:
                self.weapon_model = YOLO(self.weapon_model_path)
                self.weapon_ready = True
                logger.info(f"[+] Dedicated weapon detection model loaded: {self.weapon_model_path}")
            except Exception as e:
                logger.warning(f"[!] Could not load weapon model '{self.weapon_model_path}': {e}")
                self.weapon_ready = False

        if self.custom_object_model_path and os.path.exists(self.custom_object_model_path):
            try:
                self.custom_object_model = YOLO(self.custom_object_model_path)
                self.custom_object_ready = True
                logger.info(f"[+] Custom object model loaded: {self.custom_object_model_path}")
            except Exception as e:
                logger.warning(f"[!] Could not load custom object model '{self.custom_object_model_path}': {e}")
                self.custom_object_ready = False

    def _load_model(self):
        """Loads Ultralytics YOLO model from disk or cache."""
        if not _ULTRALYTICS_AVAILABLE:
            logger.error("[!] Ultralytics package is not installed.")
            self.is_ready = False
            return

        try:
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            models_dir_path = os.path.join(project_root, "models", self.model_path)

            if os.path.exists(models_dir_path):
                load_target = models_dir_path
            elif os.path.exists(self.model_path):
                load_target = self.model_path
            else:
                load_target = self.model_path  # Auto-download via Ultralytics

            logger.info(f"[*] Loading YOLO model: {load_target} on {self.device} ...")
            self.model = YOLO(load_target)
            self.is_ready = True
            logger.info(f"[+] YOLO detector loaded. Classes: {len(self.model.names)} | All COCO classes enabled.")
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

        Returns normalized detections for ALL detected COCO classes:
        [
          {
            "class": "person",
            "class_name": "person",
            "category": "person",
            "confidence": 0.94,
            "confidence_pct": 94.0,
            "bbox": [x, y, w, h],
            "normalized_box": [nx, ny, nw, nh],
            "center": (cx, cy),
            "camera_id": "CAM-01",
            "timestamp": "2026-09-26T...",
            "risk_level": "MONITORED",
            "cls_id": 0
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
            # Run inference on ALL classes (no class filter)
            results = self.model.predict(
                source=frame_bgr,
                conf=conf_thresh,
                imgsz=self.imgsz,
                device=self.device,
                verbose=False,
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

                # Map to known class info
                if cls_id in TARGET_CLASSES:
                    class_name, category = TARGET_CLASSES[cls_id]
                else:
                    class_name = self.model.names.get(cls_id, f"object_{cls_id}")
                    category = "object"

                conf = float(box.conf[0].item())
                xyxy = box.xyxy[0].cpu().numpy()

                x1, y1, x2, y2 = xyxy
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

                # Determine baseline risk level (context/zone rules elevate risk in pipeline)
                risk_level = OBJECT_RISK.get(category, "NORMAL")
                if class_name in MONITORED_OBJECTS:
                    risk_level = "MONITORED"

                detections.append({
                    "class": class_name,
                    "class_name": class_name,
                    "category": category,
                    "confidence": round(conf, 3),
                    "confidence_pct": round(conf * 100, 1),
                    "bbox": [x1, y1, bw, bh],
                    "normalized_box": normalized_box,
                    "center": (cx, cy),
                    "camera_id": cam_id,
                    "timestamp": timestamp,
                    "risk_level": risk_level,
                    "cls_id": cls_id,
                })

            # Optional custom everyday object model (e.g., pen, radio) if configured
            if self.custom_object_ready and self.custom_object_model is not None:
                try:
                    c_res = self.custom_object_model.predict(
                        source=frame_bgr, conf=conf_thresh, imgsz=self.imgsz, device=self.device, verbose=False
                    )
                    if c_res and len(c_res) > 0 and c_res[0].boxes is not None:
                        for box in c_res[0].boxes:
                            cls_id = int(box.cls[0].item())
                            cname = str(self.custom_object_model.names.get(cls_id, f"custom_{cls_id}")).lower()
                            conf = float(box.conf[0].item())
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            x1, y1 = max(0, min(int(x1), w - 1)), max(0, min(int(y1), h - 1))
                            x2, y2 = max(0, min(int(x2), w)), max(0, min(int(y2), h))
                            bw, bh = x2 - x1, y2 - y1
                            if bw >= 4 and bh >= 4:
                                detections.append({
                                    "class": cname,
                                    "class_name": cname,
                                    "category": "object",
                                    "confidence": round(conf, 3),
                                    "confidence_pct": round(conf * 100, 1),
                                    "bbox": [x1, y1, bw, bh],
                                    "normalized_box": [round(x1 / w, 4), round(y1 / h, 4), round(bw / w, 4), round(bh / h, 4)],
                                    "center": (int(x1 + bw / 2.0), int(y1 + bh / 2.0)),
                                    "camera_id": cam_id,
                                    "timestamp": timestamp,
                                    "risk_level": "NORMAL",
                                    "cls_id": 1000 + cls_id,
                                })
                except Exception as e:
                    logger.debug(f"Custom object model inference error: {e}")

            # Optional dedicated security/weapon model if configured
            if self.weapon_ready and self.weapon_model is not None:
                try:
                    w_res = self.weapon_model.predict(
                        source=frame_bgr, conf=max(0.55, conf_thresh), imgsz=self.imgsz, device=self.device, verbose=False
                    )
                    if w_res and len(w_res) > 0 and w_res[0].boxes is not None:
                        for box in w_res[0].boxes:
                            cls_id = int(box.cls[0].item())
                            cname = str(self.weapon_model.names.get(cls_id, f"weapon_{cls_id}")).lower()
                            conf = float(box.conf[0].item())
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            x1, y1 = max(0, min(int(x1), w - 1)), max(0, min(int(y1), h - 1))
                            x2, y2 = max(0, min(int(x2), w)), max(0, min(int(y2), h))
                            bw, bh = x2 - x1, y2 - y1
                            if bw >= 4 and bh >= 4:
                                detections.append({
                                    "class": cname,
                                    "class_name": cname,
                                    "category": "security_object",
                                    "confidence": round(conf, 3),
                                    "confidence_pct": round(conf * 100, 1),
                                    "bbox": [x1, y1, bw, bh],
                                    "normalized_box": [round(x1 / w, 4), round(y1 / h, 4), round(bw / w, 4), round(bh / h, 4)],
                                    "center": (int(x1 + bw / 2.0), int(y1 + bh / 2.0)),
                                    "camera_id": cam_id,
                                    "timestamp": timestamp,
                                    "risk_level": "CRITICAL",
                                    "cls_id": 2000 + cls_id,
                                })
                except Exception as e:
                    logger.debug(f"Weapon model inference error: {e}")

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
            "total_classes": len(TARGET_CLASSES),
            "primary_classes": ["person", "car", "truck", "bus", "motorcycle", "bicycle"],
            "all_classes": [info[0] for info in TARGET_CLASSES.values()],
            "weapon_detection": "ACTIVE" if self.weapon_ready else "NOT CONFIGURED",
            "weapon_model": self.weapon_model_path if self.weapon_ready else None,
            "custom_object_detection": "ACTIVE" if self.custom_object_ready else "NOT CONFIGURED",
            "custom_object_model": self.custom_object_model_path if self.custom_object_ready else None,
        }
