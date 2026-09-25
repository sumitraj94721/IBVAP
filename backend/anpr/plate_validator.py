"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
License Plate Syntax Validator & Normalizer
"""

import re
from typing import Dict, Any, Optional, Tuple

# Indian standard license plate regex: 2 state letters + 1-2 district digits + 1-3 series letters + 4 digits
INDIAN_PLATE_REGEX = re.compile(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$")
# General alphanumeric license plate pattern (6 to 12 chars)
GENERAL_PLATE_REGEX = re.compile(r"^[A-Z0-9]{5,12}$")

KNOWN_STATE_CODES = {
    "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA", "GJ", "HP", "HR",
    "JH", "JK", "KA", "KL", "LA", "LD", "MH", "ML", "MN", "MP", "MZ", "NL", "OD",
    "PB", "PY", "RJ", "SK", "TN", "TR", "TS", "UK", "UP", "WB"
}


class PlateValidator:
    """Validates and normalizes license plate strings."""

    @staticmethod
    def clean_text(raw_text: str) -> str:
        """Removes spaces, punctuation, special symbols, and converts to uppercase."""
        if not raw_text:
            return ""
        # Remove non-alphanumeric characters
        cleaned = re.sub(r"[^A-Za-z0-9]", "", raw_text).upper()
        return cleaned

    @classmethod
    def validate(cls, raw_text: str, ocr_confidence: float = 0.0) -> Dict[str, Any]:
        """
        Validates whether recognized text represents a valid license plate.
        
        Returns:
            dict: {
                "is_valid": bool,
                "plate_text": str,
                "formatted_plate": str,
                "state_code": Optional[str],
                "confidence": float,
                "plate_type": str
            }
        """
        cleaned = cls.clean_text(raw_text)
        if len(cleaned) < 5 or len(cleaned) > 12:
            return {
                "is_valid": False,
                "plate_text": cleaned,
                "formatted_plate": cleaned,
                "state_code": None,
                "confidence": ocr_confidence,
                "plate_type": "INVALID_LENGTH"
            }

        # Check for standard Indian plate format
        m = INDIAN_PLATE_REGEX.match(cleaned)
        if m:
            state, district, series, number = m.groups()
            formatted = f"{state} {district:0>2} {series} {number}"
            is_recognized_state = state in KNOWN_STATE_CODES
            return {
                "is_valid": True,
                "plate_text": cleaned,
                "formatted_plate": formatted,
                "state_code": state,
                "confidence": round(ocr_confidence, 1),
                "plate_type": "STANDARD_IND" if is_recognized_state else "FORMAT_MATCH"
            }

        # General alphanumeric plate check
        if GENERAL_PLATE_REGEX.match(cleaned):
            # Check if has at least 2 letters and at least 2 digits to reduce random noise
            has_letters = sum(1 for c in cleaned if c.isalpha()) >= 2
            has_digits = sum(1 for c in cleaned if c.isdigit()) >= 2
            if has_letters and has_digits:
                return {
                    "is_valid": True,
                    "plate_text": cleaned,
                    "formatted_plate": cleaned,
                    "state_code": None,
                    "confidence": round(ocr_confidence, 1),
                    "plate_type": "ALPHANUMERIC"
                }

        return {
            "is_valid": False,
            "plate_text": cleaned,
            "formatted_plate": cleaned,
            "state_code": None,
            "confidence": round(ocr_confidence, 1),
            "plate_type": "UNVERIFIED"
        }
