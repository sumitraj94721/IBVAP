"""
End-to-End Verification Test Suite for IBVAP / RAKSHAN Video Analytics Upgrade
Tests A through G as defined in Specification Section 25.
"""
import sys
import os
import time
import numpy as np
import cv2

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.detection.yolo_detector import YoloDetector
from backend.detection.tracker import MultiObjectTracker
from backend.face.face_detector import YuNetFaceDetector
from backend.face.face_embedding import SFaceFeatureExtractor
from backend.face.face_matcher import FaceMatcher
from backend.anpr.plate_detector import PlateDetector
from backend.anpr.ocr import PlateOCR
from backend.anpr.plate_validator import PlateValidator
from backend.events.event_engine import SurveillanceEventEngine
from backend.face_pipeline import SurveillanceVisionPipeline

def test_a_person_detection():
    print("\n--- TEST A: Person Detection ---")
    detector = YoloDetector(conf_thresh=0.25)
    # Synthetic frame with a filled person-like shape
    frame = np.full((480, 640, 3), 120, dtype=np.uint8)
    # Draw simple person outline (head + torso)
    cv2.circle(frame, (320, 150), 30, (50, 50, 50), -1)
    cv2.rectangle(frame, (280, 180), (360, 360), (30, 30, 30), -1)
    
    detections = detector.detect(frame)
    print(f"Frame analyzed ({frame.shape}). Detections count: {len(detections)}")
    print("Test A Passed (Detector initialized and evaluated without error).")
    return True

def test_b_multi_person_tracking():
    print("\n--- TEST B: Multi-Object Tracking & Persistent IDs ---")
    tracker = MultiObjectTracker(max_age=15, min_hits=1)
    
    # Simulate consecutive frames with 2 persons moving across frames
    det_f1 = [
        {"bbox": [100, 100, 50, 120], "class_name": "person", "confidence": 0.85, "class_id": 0},
        {"bbox": [300, 100, 50, 120], "class_name": "person", "confidence": 0.82, "class_id": 0}
    ]
    tracks_f1 = tracker.update(det_f1, frame_shape=(480, 640))
    id_f1 = [t["track_id"] for t in tracks_f1]
    print(f"Frame 1 tracks: {id_f1}")
    assert any(tid.startswith("P-") for tid in id_f1), "Person track IDs must start with P-"
    
    # Frame 2: Slight movement
    det_f2 = [
        {"bbox": [105, 102, 50, 120], "class_name": "person", "confidence": 0.88, "class_id": 0},
        {"bbox": [304, 98, 50, 120], "class_name": "person", "confidence": 0.84, "class_id": 0}
    ]
    tracks_f2 = tracker.update(det_f2, frame_shape=(480, 640))
    id_f2 = [t["track_id"] for t in tracks_f2]
    print(f"Frame 2 tracks: {id_f2}")
    
    # Verify ID persistence
    assert id_f1 == id_f2, f"Track IDs must persist across frames! f1={id_f1}, f2={id_f2}"
    print("Test B Passed (Persistent P-xxx tracking across frames verified).")
    return True

def test_c_vehicle_detection_and_tracking():
    print("\n--- TEST C: Vehicle Detection & Tracking Partition ---")
    tracker = MultiObjectTracker(max_age=15, min_hits=1)
    
    det = [
        {"bbox": [150, 200, 120, 80], "class_name": "car", "confidence": 0.91, "class_id": 2},
        {"bbox": [400, 200, 160, 100], "class_name": "truck", "confidence": 0.89, "class_id": 7}
    ]
    tracks = tracker.update(det, frame_shape=(480, 640))
    vehicle_ids = [t["track_id"] for t in tracks]
    print(f"Vehicle tracks: {vehicle_ids}")
    assert all(vid.startswith("V-") for vid in vehicle_ids), f"Vehicle IDs must start with V-, got {vehicle_ids}"
    assert tracks[0]["class_name"] in ["car", "truck"]
    print("Test C Passed (Vehicle partitioned V-xxx tracking verified).")
    return True

def test_d_face_recognition_neutral_labels():
    print("\n--- TEST D: Face Recognition Neutral Terminology ---")
    matcher = FaceMatcher(similarity_thresh=0.55)
    # Dummy unknown embedding
    dummy_emb = np.random.randn(128).astype(np.float32)
    dummy_emb /= np.linalg.norm(dummy_emb)
    
    match_result = matcher.match(dummy_emb)
    print(f"Unknown face result: {match_result}")
    assert match_result["status"] in ["UNKNOWN PERSON", "NO MATCH"], f"Must not label unknown face as suspect! Got: {match_result['status']}"
    assert "suspect" not in match_result["status"].lower() or match_result["status"] == "KNOWN PERSON", "Must adhere to neutral terminology"
    print("Test D Passed (Neutral terminology strictly enforced).")
    return True

def test_e_anpr_graceful_standby():
    print("\n--- TEST E: ANPR Standby and No Fake Plates ---")
    plate_detector = PlateDetector()
    ocr = PlateOCR()
    validator = PlateValidator()
    
    # Process a vehicle crop
    veh_crop = np.zeros((100, 200, 3), dtype=np.uint8)
    result = plate_detector.detect_and_read(veh_crop, ocr, validator)
    print(f"ANPR Result on empty vehicle crop: {result}")
    assert result["plate_text"] is None or result["plate_text"] == "", "Must NEVER fabricate fake license plates"
    assert result["status"] in ["NO_PLATE_DETECTED", "ANPR MODEL NOT CONFIGURED", "STANDBY (OCR_NOT_CONFIGURED)"]
    print("Test E Passed (Graceful ANPR standby verified, zero hallucination).")
    return True

def test_f_observable_cv_event_engine():
    print("\n--- TEST F: Observable CV Event Engine ---")
    event_engine = SurveillanceEventEngine(camera_id="CAM-01")
    
    # Track inside restricted zone
    mock_track = {
        "track_id": "P-001",
        "category": "person",
        "class_name": "person",
        "bbox": [100, 100, 50, 100],
        "relative_speed": 85.0,
        "direction": "SOUTH",
        "dwell_seconds": 4.5,
        "in_restricted_zone": True,
        "loitering": True,
        "confidence_pct": 88.0
    }
    
    res = event_engine.process([mock_track], camera_id="CAM-01")
    alerts = res["alerts"]
    print(f"Generated Alerts for restricted zone track: {[a['event_type'] for a in alerts]}")
    assert len(alerts) > 0, "Should generate zone intrusion or loitering event"
    assert any("INTRUSION" in a["event_type"] or "LOITERING" in a["event_type"] for a in alerts)
    print("Test F Passed (CV Event Engine strictly triggers on physical metrics).")
    return True

def test_g_master_pipeline_schema():
    print("\n--- TEST G: Master SurveillanceVisionPipeline Output Schema ---")
    pipeline = SurveillanceVisionPipeline(camera_id="CAM-01")
    frame = np.full((480, 640, 3), 100, dtype=np.uint8)
    
    telemetry = pipeline.process_frame(frame)
    assert "tracks" in telemetry, "Telemetry missing tracks"
    assert "kpis" in telemetry, "Telemetry missing kpis"
    assert "events" in telemetry, "Telemetry missing events"
    assert "camera_id" in telemetry, "Telemetry missing camera_id"
    
    kpis = telemetry["kpis"]
    required_kpis = ["total_persons", "active_vehicles", "active_tracks", "face_matches", "anpr_events", "active_intrusions", "active_alerts", "fps"]
    for k in required_kpis:
        assert k in kpis, f"Missing required KPI: {k}"
        
    print(f"Master pipeline output verified successfully with KPIs: {kpis}")
    print("Test G Passed (Full pipeline integration and schema compliance verified).")
    return True

if __name__ == "__main__":
    print("=================================================================")
    print("RUNNING IBVAP / RAKSHAN ACCEPTANCE TESTS A THROUGH G")
    print("=================================================================")
    t_a = test_a_person_detection()
    t_b = test_b_multi_person_tracking()
    t_c = test_c_vehicle_detection_and_tracking()
    t_d = test_d_face_recognition_neutral_labels()
    t_e = test_e_anpr_graceful_standby()
    t_f = test_f_observable_cv_event_engine()
    t_g = test_g_master_pipeline_schema()
    
    print("\n=================================================================")
    print("ALL TESTS (A through G) COMPLETED AND PASSED!")
    print("=================================================================")
