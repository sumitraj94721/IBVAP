"""
IBVAP AI Feature Upgrade — Object Detector Module
Uses MobileNet-SSD (Caffe) via OpenCV DNN for person, vehicle, and object detection.
Falls back gracefully if model files are unavailable.
"""

import os
import time
import logging
import urllib.request
import numpy as np
import cv2
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("IBVAP.ObjectDetector")

# MobileNet-SSD VOC 20-class model (23MB) — reliable, CPU-fast
MOBILENET_SSD_PROTOTXT_URL = (
    "https://raw.githubusercontent.com/chuanqi305/MobileNet-SSD/master/"
    "deploy.prototxt"
)
MOBILENET_SSD_MODEL_URL = (
    "https://drive.google.com/uc?export=download&"
    "id=0B3gersZ2cHIxRm5PMWRoTkdHdHc"
)
# Reliable mirror:
MOBILENET_SSD_MODEL_MIRROR = (
    "https://github.com/djmv/MobilNet_SSD_opencv/raw/master/"
    "MobileNetSSD_deploy.caffemodel"
)
MOBILENET_SSD_PROTO_MIRROR = (
    "https://github.com/djmv/MobilNet_SSD_opencv/raw/master/"
    "MobileNetSSD_deploy.prototxt"
)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")

PROTO_PATH = os.path.join(MODELS_DIR, "MobileNetSSD_deploy.prototxt")
MODEL_PATH = os.path.join(MODELS_DIR, "MobileNetSSD_deploy.caffemodel")

# MobileNet-SSD VOC class labels (index 0 = background)
VOC_CLASSES = [
    "background", "aeroplane", "bicycle", "bird", "boat",
    "bottle", "bus", "car", "cat", "chair", "cow",
    "diningtable", "dog", "horse", "motorbike", "person",
    "pottedplant", "sheep", "sofa", "train", "tvmonitor"
]

# Category groupings for IBVAP
PERSON_CLASSES = {"person"}
VEHICLE_CLASSES = {"bicycle", "bus", "car", "motorbike", "train", "aeroplane", "boat"}
OBJECT_CLASSES = {"bottle", "chair", "diningtable", "tvmonitor", "pottedplant", "sofa"}

# All classes we care about for surveillance (skip animals, background)
RELEVANT_CLASSES = PERSON_CLASSES | VEHICLE_CLASSES | OBJECT_CLASSES

CONFIDENCE_THRESHOLD = 0.45


def _download_file(url: str, dest_path: str, label: str) -> bool:
    """Download a file with progress logging. Returns True on success."""
    try:
        logger.info(f"[*] Downloading {label} from {url} ...")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=90) as resp, open(dest_path, "wb") as f:
            f.write(resp.read())
        size = os.path.getsize(dest_path)
        logger.info(f"[+] Downloaded {label}: {size} bytes → {dest_path}")
        return size > 10_000
    except Exception as e:
        logger.warning(f"[!] Could not download {label}: {e}")
        if os.path.exists(dest_path):
            os.remove(dest_path)
        return False


def ensure_object_detector_models() -> bool:
    """
    Ensures the MobileNet-SSD model files exist.
    Downloads them if missing.
    Returns True if models are ready.
    """
    os.makedirs(MODELS_DIR, exist_ok=True)

    proto_ok = os.path.exists(PROTO_PATH) and os.path.getsize(PROTO_PATH) > 1000
    model_ok = os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) > 1_000_000

    if not proto_ok:
        proto_ok = _download_file(MOBILENET_SSD_PROTO_MIRROR, PROTO_PATH, "MobileNetSSD prototxt")
    if not model_ok:
        model_ok = _download_file(MOBILENET_SSD_MODEL_MIRROR, MODEL_PATH, "MobileNetSSD caffemodel")

    return proto_ok and model_ok


class ObjectDetector:
    """
    Lightweight MobileNet-SSD object detector via OpenCV DNN.

    Detects: person, car, bus, truck, motorbike, bicycle, bottle, and other VOC classes.
    Runs inference at ~10 FPS on laptop CPU.
    Degrades gracefully if model files are unavailable.
    """

    def __init__(self):
        self.net = None
        self.is_ready = False
        self.model_name = "MobileNet-SSD (VOC 20-class)"
        self._load()

    def _load(self):
        """Load the Caffe model into OpenCV DNN."""
        try:
            ready = ensure_object_detector_models()
            if not ready:
                logger.warning("[!] Object detector models unavailable. Detector OFFLINE.")
                return

            self.net = cv2.dnn.readNetFromCaffe(PROTO_PATH, MODEL_PATH)
            self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
            self.is_ready = True
            logger.info("[+] ObjectDetector (MobileNet-SSD) loaded successfully.")
        except Exception as e:
            logger.error(f"[!] Failed to load ObjectDetector: {e}")
            self.net = None
            self.is_ready = False

    def detect(
        self,
        frame_bgr: np.ndarray,
        confidence_threshold: float = CONFIDENCE_THRESHOLD,
    ) -> List[Dict[str, Any]]:
        """
        Run object detection on a BGR frame.

        Returns a list of detections, each with:
            - class_name: str (e.g. "person", "car")
            - category: str ("person" | "vehicle" | "object")
            - confidence: float (0-100)
            - box: [x, y, w, h] in pixels
            - normalized_box: [nx, ny, nw, nh] (0-1)
        """
        if not self.is_ready or self.net is None or frame_bgr is None:
            return []

        h, w = frame_bgr.shape[:2]
        try:
            # Resize to 300x300 as required by MobileNet-SSD
            blob = cv2.dnn.blobFromImage(
                frame_bgr,
                scalefactor=0.007843,
                size=(300, 300),
                mean=(127.5, 127.5, 127.5),
                swapRB=False,
                crop=False,
            )
            self.net.setInput(blob)
            detections = self.net.forward()  # shape: (1, 1, N, 7)

            results = []
            for i in range(detections.shape[2]):
                conf = float(detections[0, 0, i, 2])
                if conf < confidence_threshold:
                    continue

                class_idx = int(detections[0, 0, i, 1])
                if class_idx < 0 or class_idx >= len(VOC_CLASSES):
                    continue

                class_name = VOC_CLASSES[class_idx]
                if class_name not in RELEVANT_CLASSES:
                    continue

                # Bounding box in frame pixels
                x1 = int(detections[0, 0, i, 3] * w)
                y1 = int(detections[0, 0, i, 4] * h)
                x2 = int(detections[0, 0, i, 5] * w)
                y2 = int(detections[0, 0, i, 6] * h)

                # Clamp to frame
                x1 = max(0, min(x1, w - 1))
                y1 = max(0, min(y1, h - 1))
                x2 = max(0, min(x2, w))
                y2 = max(0, min(y2, h))
                bw = x2 - x1
                bh = y2 - y1

                if bw < 5 or bh < 5:
                    continue

                if class_name in PERSON_CLASSES:
                    category = "person"
                elif class_name in VEHICLE_CLASSES:
                    category = "vehicle"
                else:
                    category = "object"

                results.append({
                    "class_name": class_name,
                    "category": category,
                    "confidence": round(conf * 100, 1),
                    "box": [x1, y1, bw, bh],
                    "normalized_box": [
                        round(x1 / w, 4),
                        round(y1 / h, 4),
                        round(bw / w, 4),
                        round(bh / h, 4),
                    ],
                })

            return results

        except Exception as e:
            logger.error(f"[!] ObjectDetector inference error: {e}")
            return []

    def status(self) -> str:
        return "ONLINE" if self.is_ready else "OFFLINE"
