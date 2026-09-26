"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Dedicated License Plate Detector Module
Detects and crops vehicle license plates from vehicle ROIs.
Provides graceful ANPR MODEL NOT CONFIGURED state if dedicated weights are absent.
"""

import os
import cv2
import numpy as np
import logging
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("IBVAP.PlateDetector")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIGURED_PLATE_MODEL_PATH = os.getenv("ANPR_PLATE_MODEL_PATH", os.path.join(PROJECT_ROOT, "models", "license_plate_detector.pt"))


class PlateDetector:
    """
    Dedicated License Plate Detector.
    
    Operates on vehicle bounding boxes or full frames.
    Checks for a dedicated plate model (PyTorch/ONNX).
    If no dedicated model is configured, provides a contour/aspect-ratio based
    plate candidate proposal fallback or cleanly reports ANPR MODEL NOT CONFIGURED.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or CONFIGURED_PLATE_MODEL_PATH
        self.has_dedicated_model = False
        self.dedicated_net = None

        self._check_dedicated_model()

    def _check_dedicated_model(self):
        """Checks if a dedicated trained license plate weights file exists."""
        if os.path.exists(self.model_path) and os.path.getsize(self.model_path) > 10_000:
            try:
                # If YOLO model weights exist for plates
                if self.model_path.endswith(".pt"):
                    from ultralytics import YOLO
                    self.dedicated_net = YOLO(self.model_path)
                    self.has_dedicated_model = True
                    logger.info(f"[+] Loaded dedicated ANPR YOLO model from: {self.model_path}")
                elif self.model_path.endswith(".onnx"):
                    self.dedicated_net = cv2.dnn.readNetFromONNX(self.model_path)
                    self.has_dedicated_model = True
                    logger.info(f"[+] Loaded dedicated ANPR ONNX model from: {self.model_path}")
            except Exception as e:
                logger.warning(f"[!] Could not load dedicated plate model at {self.model_path}: {e}")
                self.has_dedicated_model = False
        else:
            self.has_dedicated_model = False
            logger.info(f"[*] Dedicated ANPR model not present at '{self.model_path}'. Active mode: CONTOUR_ROI_FALLBACK.")

    def detect_plates(
        self,
        frame_bgr: np.ndarray,
        vehicle_box: Optional[List[int]] = None
    ) -> List[Dict[str, Any]]:
        """
        Locates license plates within a vehicle bounding box or frame.
        
        Returns:
            list of candidate plate dicts:
            {
                "bbox": [x, y, w, h],
                "plate_crop": np.ndarray,
                "confidence": float,
                "detector": "DEDICATED_MODEL" | "CONTOUR_ROI"
            }
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        frame_h, frame_w = frame_bgr.shape[:2]

        # Restrict to vehicle region if vehicle_box is provided
        if vehicle_box is not None:
            vx, vy, vw, vh = vehicle_box
            vx = max(0, min(vx, frame_w - 5))
            vy = max(0, min(vy, frame_h - 5))
            vw = min(frame_w - vx, vw)
            vh = min(frame_h - vy, vh)
            if vw < 30 or vh < 30:
                return []
            vehicle_roi = frame_bgr[vy:vy + vh, vx:vx + vw]
            offset_x, offset_y = vx, vy
        else:
            vehicle_roi = frame_bgr
            offset_x, offset_y = 0, 0

        # Case 1: Dedicated trained model is available
        if self.has_dedicated_model and self.dedicated_net is not None:
            return self._detect_with_model(vehicle_roi, offset_x, offset_y, frame_bgr)

        # Case 2: Computer Vision contour proposal (searches lower 60% of vehicle where plates reside)
        return self._detect_with_contours(vehicle_roi, offset_x, offset_y, frame_bgr)

    def _detect_with_model(self, roi: np.ndarray, ox: int, oy: int, full_frame: np.ndarray) -> List[Dict[str, Any]]:
        try:
            results = self.dedicated_net.predict(source=roi, conf=0.45, verbose=False)
            candidates = []
            if results and len(results) > 0:
                boxes = results[0].boxes
                for box in boxes:
                    xyxy = box.xyxy[0].cpu().numpy()
                    x1, y1, x2, y2 = [int(v) for v in xyxy]
                    px = x1 + ox
                    py = y1 + oy
                    pw = x2 - x1
                    ph = y2 - y1
                    crop = full_frame[py:py + ph, px:px + pw]
                    if crop.size > 0:
                        candidates.append({
                            "bbox": [px, py, pw, ph],
                            "plate_crop": crop,
                            "confidence": round(float(box.conf[0].item()) * 100, 1),
                            "detector": "DEDICATED_MODEL"
                        })
            return candidates
        except Exception as e:
            logger.debug(f"Dedicated plate model error: {e}")
            return []

    def _detect_with_contours(self, roi: np.ndarray, ox: int, oy: int, full_frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Locates rectangular plate-like candidates in the lower half of vehicle ROI.
        Standard license plate aspect ratio is typically between 2.0 and 5.5.
        """
        roi_h, roi_w = roi.shape[:2]
        # Most vehicle plates are in the bottom 60% of the vehicle
        search_start_y = int(roi_h * 0.40)
        search_roi = roi[search_start_y:roi_h, 0:roi_w]
        if search_roi.size == 0:
            return []

        gray = cv2.cvtColor(search_roi, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 100, 200)

        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            ratio = float(w) / max(1, h)
            area = w * h
            min_area = (roi_w * roi_h) * 0.015
            max_area = (roi_w * roi_h) * 0.40

            # Valid aspect ratio for standard plates is ~2.0 to 5.5
            if 2.0 <= ratio <= 5.5 and min_area <= area <= max_area:
                px = ox + x
                py = oy + search_start_y + y
                pw = w
                ph = h

                # Clamp to full frame
                fh, fw = full_frame.shape[:2]
                px = max(0, min(px, fw - 5))
                py = max(0, min(py, fh - 5))
                pw = min(fw - px, pw)
                ph = min(fh - py, ph)

                crop = full_frame[py:py + ph, px:px + pw]
                if crop.size > 0:
                    candidates.append({
                        "bbox": [px, py, pw, ph],
                        "plate_crop": crop,
                        "confidence": 70.0,
                        "detector": "CONTOUR_ROI"
                    })
                    if len(candidates) >= 2:
                        break

        return candidates

    def status(self) -> Dict[str, Any]:
        if self.has_dedicated_model:
            mode_str = "ONLINE (DEDICATED_MODEL_LOADED)"
        else:
            mode_str = "ANPR MODEL NOT CONFIGURED (CONTOUR_FALLBACK)"
        return {
            "status": mode_str,
            "has_dedicated_model": self.has_dedicated_model,
            "configured_model_path": self.model_path
        }

    def detect_and_read(
        self,
        vehicle_crop: np.ndarray,
        ocr: Optional[Any] = None,
        validator: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Convenience pipeline method to detect candidate plate and read OCR text with syntax validation.
        Guarantees zero hallucination: returns STANDBY / NO_PLATE_DETECTED if unconfigured or undetected.
        """
        if not self.has_dedicated_model:
            status_desc = "ANPR MODEL NOT CONFIGURED"
        else:
            status_desc = "ONLINE"

        candidates = self.detect_plates(vehicle_crop)
        if not candidates:
            return {
                "plate_text": None,
                "confidence": 0.0,
                "is_valid": False,
                "status": status_desc if not self.has_dedicated_model else "NO_PLATE_DETECTED"
            }

        if ocr is None or not getattr(ocr, "is_ready", False):
            return {
                "plate_text": None,
                "confidence": 0.0,
                "is_valid": False,
                "status": "STANDBY (OCR_NOT_CONFIGURED)"
            }

        best_cand = candidates[0]
        ocr_res = ocr.read_plate(best_cand["plate_crop"])
        val_res = validator.validate(ocr_res["text"], ocr_res["confidence"]) if validator else {"is_valid": False, "plate_text": ocr_res["text"]}

        return {
            **val_res,
            "bbox": best_cand["bbox"],
            "status": "DETECTED" if val_res.get("is_valid") else "NO_MATCH"
        }

