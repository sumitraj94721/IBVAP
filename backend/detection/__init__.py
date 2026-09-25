"""
IBVAP AI Video Analytics - Detection and Tracking Module
"""
from backend.detection.yolo_detector import YoloDetector
from backend.detection.tracker import MultiObjectTracker

__all__ = ["YoloDetector", "MultiObjectTracker"]
