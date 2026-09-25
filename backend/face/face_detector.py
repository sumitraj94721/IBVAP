"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
YuNet Face Detection with 5 Facial Landmarks
"""

import os
import cv2
import numpy as np
import logging
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("IBVAP.FaceDetector")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_YUNET_PATH = os.path.join(PROJECT_ROOT, "models", "face_detection_yunet_2023mar.onnx")


class YuNetFaceDetector:
    """
    High-performance YuNet ONNX Deep Neural Network face detector.
    Outputs facial bounding boxes and 5 facial landmarks for alignment.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        confidence_threshold: float = 0.55,
        nms_threshold: float = 0.3
    ):
        self.model_path = model_path or DEFAULT_YUNET_PATH
        self.confidence_threshold = confidence_threshold
        self.nms_threshold = nms_threshold
        self.current_input_size = (320, 320)
        self.detector = None
        self.is_ready = False

        self._load()

    def _load(self):
        if not os.path.exists(self.model_path):
            logger.warning(f"[!] YuNet model not found at {self.model_path}")
            self.is_ready = False
            return

        try:
            self.detector = cv2.FaceDetectorYN.create(
                model=self.model_path,
                config="",
                input_size=self.current_input_size,
                score_threshold=self.confidence_threshold,
                nms_threshold=self.nms_threshold,
                top_k=50
            )
            self.is_ready = True
            logger.info("[+] YuNet DNN Face Detector loaded successfully.")
        except Exception as e:
            logger.error(f"[!] Failed to initialize YuNet: {e}")
            self.detector = None
            self.is_ready = False

    def detect(
        self,
        frame_bgr: np.ndarray,
        person_box: Optional[List[int]] = None
    ) -> List[Dict[str, Any]]:
        """
        Detect faces in frame, optionally localized within a person bounding box.
        
        Returns:
            list of dicts:
            {
                "box": [x, y, w, h],
                "confidence": float (percentage),
                "landmarks": [[x, y], ...], # 5 points
                "raw_face": numpy array of raw YuNet face row for SFace alignment
            }
        """
        if not self.is_ready or self.detector is None or frame_bgr is None or frame_bgr.size == 0:
            return []

        frame_h, frame_w = frame_bgr.shape[:2]

        # If a person bounding box is given, crop ROI to speed up and isolate face
        offset_x, offset_y = 0, 0
        if person_box is not None:
            px, py, pw, ph = person_box
            # Focus on upper 60% of person box for face search
            face_search_h = int(ph * 0.65)
            x1 = max(0, px)
            y1 = max(0, py)
            x2 = min(frame_w, px + pw)
            y2 = min(frame_h, py + face_search_h)
            if (x2 - x1) < 20 or (y2 - y1) < 20:
                return []
            input_frame = frame_bgr[y1:y2, x1:x2]
            offset_x, offset_y = x1, y1
        else:
            input_frame = frame_bgr

        ih, iw = input_frame.shape[:2]
        if (iw, ih) != self.current_input_size:
            self.current_input_size = (iw, ih)
            self.detector.setInputSize((iw, ih))

        try:
            _, faces = self.detector.detect(input_frame)
            if faces is None or len(faces) == 0:
                return []

            results = []
            for face in faces:
                score = float(face[14])
                if score < self.confidence_threshold:
                    continue

                # Box coordinates
                fx = max(0, int(face[0])) + offset_x
                fy = max(0, int(face[1])) + offset_y
                fw = int(face[2])
                fh = int(face[3])

                # Clamp
                fx = min(frame_w - 5, fx)
                fy = min(frame_h - 5, fy)
                fw = min(frame_w - fx, fw)
                fh = min(frame_h - fy, fh)

                landmarks = [
                    [int(face[4]) + offset_x, int(face[5]) + offset_y],   # Right eye
                    [int(face[6]) + offset_x, int(face[7]) + offset_y],   # Left eye
                    [int(face[8]) + offset_x, int(face[9]) + offset_y],   # Nose tip
                    [int(face[10]) + offset_x, int(face[11]) + offset_y], # Right mouth corner
                    [int(face[12]) + offset_x, int(face[13]) + offset_y]  # Left mouth corner
                ]

                # Create full-frame calibrated face row for FaceRecognizerSF
                full_face = face.copy()
                full_face[0] = fx
                full_face[1] = fy
                full_face[2] = fw
                full_face[3] = fh
                full_face[4] += offset_x; full_face[5] += offset_y
                full_face[6] += offset_x; full_face[7] += offset_y
                full_face[8] += offset_x; full_face[9] += offset_y
                full_face[10] += offset_x; full_face[11] += offset_y
                full_face[12] += offset_x; full_face[13] += offset_y

                results.append({
                    "box": [fx, fy, fw, fh],
                    "confidence": round(score * 100, 1),
                    "landmarks": landmarks,
                    "raw_face": full_face
                })

            return results
        except Exception as e:
            logger.debug(f"YuNet detection exception: {e}")
            return []
