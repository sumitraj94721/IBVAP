"""
IBVAP AI Video Analytics - ANPR Pipeline Package
"""
from backend.anpr.plate_detector import PlateDetector
from backend.anpr.ocr import PlateOCR
from backend.anpr.plate_validator import PlateValidator

__all__ = ["PlateDetector", "PlateOCR", "PlateValidator"]
