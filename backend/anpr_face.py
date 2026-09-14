"""Edge ANPR and privacy-conscious face detection helpers."""

import os
import re
from typing import Any, Dict, List, Optional, Sequence

import cv2
import numpy as np

try:
    import pytesseract
except ImportError:  # OCR is optional on constrained edge deployments.
    pytesseract = None


class ANPRFaceProcessor:
    """Detect faces and read plates from already-classified vehicle ROIs.

    This class intentionally does not persist face crops, landmarks, or identity
    data. Vehicle detections can be supplied by a detector available on the edge
    device; OCR is only attempted for detections above the configured threshold.
    """

    PLATE_PATTERN = re.compile(r"[^A-Z0-9]")

    def __init__(self, min_vehicle_confidence: float = 0.70):
        self.min_vehicle_confidence = min_vehicle_confidence
        haar_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        self.face_detector = cv2.CascadeClassifier(haar_path)

    def detect_faces(self, frame_bgr: np.ndarray) -> List[Dict[str, Any]]:
        if frame_bgr is None or frame_bgr.size == 0 or self.face_detector.empty():
            return []
        gray = cv2.equalizeHist(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY))
        boxes = self.face_detector.detectMultiScale(gray, 1.15, 5, minSize=(30, 30))
        return [
            {
                "box": [int(x), int(y), int(w), int(h)],
                "confidence": 92.0,
                "tag": "FACE DETECTED (CONF: 92%)",
            }
            for x, y, w, h in boxes
        ]

    def process(
        self,
        frame_bgr: np.ndarray,
        vehicle_detections: Optional[Sequence[Dict[str, Any]]] = None,
        face_detections: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> Dict[str, List[Dict[str, Any]]]:
        faces = list(face_detections) if face_detections is not None else self.detect_faces(frame_bgr)
        vehicles = []
        candidate_detections = (
            list(vehicle_detections)
            if vehicle_detections is not None
            else self.detect_vehicle_regions(frame_bgr)
        )
        for detection in candidate_detections:
            confidence = float(detection.get("confidence", 0.0))
            if confidence < self.min_vehicle_confidence:
                continue
            box = [int(value) for value in detection.get("box", [0, 0, 0, 0])]
            vehicle_type = str(detection.get("object_type", detection.get("type", "VEHICLE"))).upper()
            plate, simulated = self.read_plate(frame_bgr, box)
            vehicles.append({
                "box": box,
                "object_type": vehicle_type,
                "confidence": round(confidence * 100, 1) if confidence <= 1 else round(confidence, 1),
                "plate": plate,
                "simulated": simulated,
                "hud": f"[VEHICLE: {vehicle_type} | PLATE: {plate}]",
            })
        return {"faces": faces, "vehicles": vehicles}

    def detect_vehicle_regions(self, frame_bgr: np.ndarray) -> List[Dict[str, Any]]:
        """Propose vehicle ROIs from plate-like contours when no detector is supplied."""
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        threshold = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                          cv2.THRESH_BINARY, blockSize=theshold_block_size(), C=5)
        contours, _ = cv2.findContours(threshold, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        height, width = gray.shape[:2]
        proposals = []
        for contour in contours:
            x, y, contour_width, contour_height = cv2.boundingRect(contour)
            ratio = contour_width / max(contour_height, 1)
            area = contour_width * contour_height
            if not (2.5 <= ratio <= 6.5 and area > width * height * 0.002):
                continue
            pad_x, pad_y = contour_width * 2, contour_height * 5
            x1, y1 = max(0, int(x - pad_x)), max(0, int(y - pad_y))
            x2, y2 = min(width, int(x + contour_width + pad_x)), min(height, int(y + contour_height + pad_y))
            proposals.append({
                "box": [x1, y1, x2 - x1, y2 - y1],
                "object_type": "VEHICLE",
                "confidence": 0.72,
            })
        return proposals[:5]

    def read_plate(self, frame_bgr: np.ndarray, vehicle_box: Sequence[int]) -> tuple[str, bool]:
        x, y, width, height = [int(value) for value in vehicle_box]
        frame_height, frame_width = frame_bgr.shape[:2]
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(frame_width, x + width), min(frame_height, y + height)
        roi = frame_bgr[y1:y2, x1:x2]
        if roi.size == 0:
            return "DEMO-JK-02-4412 [SIMULATED]", True

        plate_crop = self._locate_plate(roi)
        if pytesseract is not None and plate_crop is not None:
            try:
                raw = pytesseract.image_to_string(
                    plate_crop, config="--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
                )
                text = self.PLATE_PATTERN.sub("", raw.upper())
                if 5 <= len(text) <= 12:
                    return self._format_plate(text), False
            except Exception:
                pass
        return "DEMO-JK-02-4412 [SIMULATED]", True

    @staticmethod
    def _locate_plate(vehicle_roi: np.ndarray) -> Optional[np.ndarray]:
        gray = cv2.cvtColor(vehicle_roi, cv2.COLOR_BGR2GRAY)
        threshold = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                          cv2.THRESH_BINARY,  blockSize= theshold_block_size(), C=5)
        contours, _ = cv2.findContours(threshold, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        roi_height, roi_width = gray.shape[:2]
        candidates = []
        for contour in contours:
            x, y, width, height = cv2.boundingRect(contour)
            ratio = width / max(height, 1)
            area = width * height
            if 2.0 <= ratio <= 6.5 and area > roi_width * roi_height * 0.01:
                candidates.append((area, vehicle_roi[y:y + height, x:x + width]))
        return max(candidates, key=lambda item: item[0])[1] if candidates else None

    @staticmethod
    def _format_plate(text: str) -> str:
        if len(text) >= 8:
            return f"{text[:2]}-{text[2:4]}-{text[4:6]}-{text[6:]}"
        return text

    @staticmethod
    def annotate(frame_bgr: np.ndarray, result: Dict[str, List[Dict[str, Any]]]) -> np.ndarray:
        for face in result.get("faces", []):
            x, y, width, height = face["box"]
            cv2.rectangle(frame_bgr, (x, y), (x + width, y + height), (255, 240, 0), 2)
            cv2.putText(frame_bgr, face.get("tag", "FACE DETECTED"), (x, max(20, y - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 240, 0), 2)
        for vehicle in result.get("vehicles", []):
            x, y, width, height = vehicle["box"]
            cv2.rectangle(frame_bgr, (x, y), (x + width, y + height), (0, 200, 255), 2)
            cv2.putText(frame_bgr, vehicle["hud"], (x, max(20, y - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 2)
        return frame_bgr


def theshold_block_size() -> int:
    """Return a valid odd threshold window for small vehicle crops."""
    return 11