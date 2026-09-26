"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
SFace 128D Face Feature Extractor & Alignment
Uses OpenCV Zoo SFace ONNX model for face alignment and embedding extraction.
"""

import os
import cv2
import numpy as np
import logging
from typing import Optional

logger = logging.getLogger("IBVAP.FaceEmbedding")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SFACE_PATH = os.path.join(PROJECT_ROOT, "models", "face_recognition_sface_2021dec.onnx")


class SFaceFeatureExtractor:
    """
    SFace Deep Neural Network Feature Extractor.
    Extracts 128-dimensional L2-normalized facial embeddings.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or DEFAULT_SFACE_PATH
        self.recognizer = None
        self.is_ready = False
        self._load()

    def _load(self):
        if not os.path.exists(self.model_path):
            logger.warning(f"[!] SFace model not found at {self.model_path}")
            self.is_ready = False
            return

        try:
            self.recognizer = cv2.FaceRecognizerSF.create(
                model=self.model_path,
                config=""
            )
            self.is_ready = True
            logger.info("[+] SFace 128D Feature Extractor loaded successfully.")
        except Exception as e:
            logger.error(f"[!] Failed to load SFace model: {e}")
            self.recognizer = None
            self.is_ready = False

    def extract_embedding(self, frame_bgr: np.ndarray, raw_face: np.ndarray) -> Optional[np.ndarray]:
        """
        Aligns the face and extracts a 128-dimensional L2-normalized embedding.
        
        Args:
            frame_bgr: Full frame containing the face.
            raw_face: Raw face output from YuNet.
            
        Returns:
            np.ndarray of shape (128,) or None if alignment/extraction failed.
        """
        if not self.is_ready or self.recognizer is None or frame_bgr is None:
            return None

        try:
            # 1. Align & crop face (standard 112x112 aligned face crop)
            aligned_face = self.recognizer.alignCrop(frame_bgr, raw_face)
            if aligned_face is None or aligned_face.size == 0:
                return None

            # 2. Extract 128D embedding vector
            feature = self.recognizer.feature(aligned_face) # shape: (1, 128)
            feature = feature.flatten()

            # 3. Ensure L2 normalization
            norm = np.linalg.norm(feature)
            if norm > 1e-6:
                feature = feature / norm

            return feature
        except Exception as e:
            logger.debug(f"SFace extraction exception: {e}")
            return None

    @staticmethod
    def cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Computes cosine similarity between two 128D vectors.
        Since embeddings are L2 normalized, cosine similarity is their dot product.
        """
        if emb1 is None or emb2 is None:
            return 0.0
        v1 = np.asarray(emb1, dtype=np.float32).flatten()
        v2 = np.asarray(emb2, dtype=np.float32).flatten()
        if len(v1) == 0 or len(v2) == 0 or len(v1) != len(v2):
            return 0.0
        sim = float(np.dot(v1, v2))
        return max(0.0, min(1.0, sim))
