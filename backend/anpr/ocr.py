"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
ANPR OCR Engine Module
Performs license plate preprocessing and optical character recognition via pytesseract.
"""

import os
import shutil
import logging
from typing import Dict, Any, Optional, Tuple
import cv2
import numpy as np

try:
    import pytesseract
    _PYTESSERACT_AVAILABLE = True
except ImportError:
    _PYTESSERACT_AVAILABLE = False
    pytesseract = None

logger = logging.getLogger("IBVAP.PlateOCR")

# Standard Windows and Linux installation paths for Tesseract
TESSERACT_CANDIDATE_PATHS = [
    os.getenv("TESSERACT_CMD", ""),
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
    "/usr/bin/tesseract",
    "/usr/local/bin/tesseract"
]


class PlateOCR:
    """
    License Plate Optical Character Recognition Engine.
    Preprocesses plate crops and extracts text with confidence scores.
    """

    def __init__(self, tesseract_cmd: Optional[str] = None):
        self.tesseract_cmd = tesseract_cmd
        self.is_ready = False
        self._init_tesseract()

    def _init_tesseract(self):
        """Locates and configures the Tesseract OCR executable."""
        if not _PYTESSERACT_AVAILABLE:
            logger.warning("[!] pytesseract Python package is not installed.")
            self.is_ready = False
            return

        cmd = self.tesseract_cmd
        if not cmd:
            # Check candidate paths
            for p in TESSERACT_CANDIDATE_PATHS:
                if p and os.path.exists(p):
                    cmd = p
                    break

        if not cmd:
            which_tess = shutil.which("tesseract")
            if which_tess:
                cmd = which_tess

        if cmd and os.path.exists(cmd):
            try:
                pytesseract.pytesseract.tesseract_cmd = cmd
                self.tesseract_cmd = cmd
                self.is_ready = True
                logger.info(f"[+] Tesseract OCR initialized at: {cmd}")
            except Exception as e:
                logger.warning(f"[!] Could not configure Tesseract at {cmd}: {e}")
                self.is_ready = False
        else:
            logger.info("[*] Tesseract binary not found in standard paths. ANPR OCR engine is in STANDBY.")
            self.is_ready = False

    def preprocess_plate(self, plate_bgr: np.ndarray) -> np.ndarray:
        """
        Enhances character contrast for robust optical character recognition.
        Steps: Grayscale -> Bilateral Filter -> CLAHE contrast enhancement -> Otsu thresholding.
        """
        if plate_bgr is None or plate_bgr.size == 0:
            return plate_bgr

        # 1. Convert to grayscale
        if len(plate_bgr.shape) == 3:
            gray = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
        else:
            gray = plate_bgr.copy()

        # 2. Resize to a consistent height (around 64px) for better OCR accuracy
        h, w = gray.shape[:2]
        if h < 40 or h > 120:
            target_h = 64
            scale = target_h / max(1, h)
            target_w = int(w * scale)
            gray = cv2.resize(gray, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

        # 3. Bilateral filter to smooth noise while preserving character edges
        blurred = cv2.bilateralFilter(gray, 9, 75, 75)

        # 4. Adaptive threshold or Otsu binarization
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return thresh

    def read_plate(self, plate_bgr: np.ndarray) -> Dict[str, Any]:
        """
        Reads license plate characters from cropped plate image.
        
        Returns:
            dict: {
                "success": bool,
                "text": str,
                "confidence": float,
                "status": "SUCCESS" | "LOW_CONFIDENCE" | "OCR_NOT_CONFIGURED" | "NO_TEXT"
            }
        """
        if not self.is_ready or pytesseract is None:
            return {
                "success": False,
                "text": "",
                "confidence": 0.0,
                "status": "OCR_NOT_CONFIGURED"
            }

        if plate_bgr is None or plate_bgr.size == 0:
            return {
                "success": False,
                "text": "",
                "confidence": 0.0,
                "status": "NO_IMAGE"
            }

        try:
            processed = self.preprocess_plate(plate_bgr)
            config = (
                "--oem 3 --psm 7 "
                "-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            )

            data = pytesseract.image_to_data(processed, config=config, output_type=pytesseract.Output.DICT)
            texts = []
            confs = []

            for i in range(len(data["text"])):
                txt = data["text"][i].strip()
                conf_val = float(data["conf"][i])
                if txt and conf_val > 0:
                    texts.append(txt)
                    confs.append(conf_val)

            full_text = "".join(texts)
            avg_conf = float(np.mean(confs)) if confs else 0.0

            if not full_text:
                return {
                    "success": False,
                    "text": "",
                    "confidence": 0.0,
                    "status": "NO_TEXT"
                }

            return {
                "success": avg_conf >= 45.0,
                "text": full_text,
                "confidence": round(avg_conf, 1),
                "status": "SUCCESS" if avg_conf >= 60.0 else "LOW_CONFIDENCE"
            }

        except Exception as e:
            logger.debug(f"Plate OCR inference error: {e}")
            return {
                "success": False,
                "text": "",
                "confidence": 0.0,
                "status": f"ERROR: {str(e)}"
            }

    def status(self) -> Dict[str, Any]:
        return {
            "status": "ONLINE" if self.is_ready else "STANDBY (OCR_NOT_CONFIGURED)",
            "engine": "pytesseract",
            "tesseract_cmd": self.tesseract_cmd or "NOT_FOUND"
        }
