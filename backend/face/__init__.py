"""
IBVAP AI Video Analytics - Face Recognition Package
"""
from backend.face.face_detector import YuNetFaceDetector
from backend.face.face_embedding import SFaceFeatureExtractor
from backend.face.face_matcher import FaceMatcher

__all__ = ["YuNetFaceDetector", "SFaceFeatureExtractor", "FaceMatcher"]
