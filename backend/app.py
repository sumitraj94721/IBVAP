"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Master FastAPI Application
Provides REST endpoints, WebSocket video processing, tactical alert hub, and camera streams.
"""

import os
import sys
import time
import base64
import json
import logging
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Depends, Request, Response, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.face_pipeline import SurveillanceVisionPipeline
from backend.events.incident_fusion import IBVAPIncidentFusionEngine
from backend.camera_streamer import OpenCVCameraStreamer, RemoteCameraStreamer
from backend.stream_generators import stream_manager
from backend.storage_sync import StorageSyncManager
from backend.database import get_db_connection
from backend.auth_router import auth_router, get_current_officer
from backend.auth_service import DEMO_BYPASS_AUTH

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("IBVAP.Backend")

# Directory paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
SNAPSHOT_DIR = os.path.join(PROJECT_ROOT, "static", "snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# Initialize FastAPI App
app = FastAPI(
    title="IBVAP — Intelligent Border Video Analytics Platform (SIH 2026)",
    description="Real-time Multi-Camera Border Video Analytics, Activity Understanding, Face Recognition & ANPR Platform",
    version="2.5.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include RBAC Authentication Router
app.include_router(auth_router)

# Mount static snapshot and demo directories
if os.path.exists(SNAPSHOT_DIR):
    app.mount("/static/snapshots", StaticFiles(directory=SNAPSHOT_DIR), name="snapshots")

DEMO_MEDIA_DIR = os.path.join(PROJECT_ROOT, "public", "demo")
if os.path.exists(DEMO_MEDIA_DIR):
    app.mount("/demo", StaticFiles(directory=DEMO_MEDIA_DIR), name="demo_media")

# Global Vision Pipeline, Multi-Camera Fusion Engine & Camera Managers
pipeline = SurveillanceVisionPipeline(camera_id="CAM-01")
fusion_engine = IBVAPIncidentFusionEngine(snapshot_dir=SNAPSHOT_DIR)
storage = StorageSyncManager(project_root=PROJECT_ROOT)
backend_camera: Optional[OpenCVCameraStreamer] = None
edge_camera: Optional[OpenCVCameraStreamer] = None
remote_camera: Optional[RemoteCameraStreamer] = None
last_event_at: Dict[str, float] = {}

# Connected WebSocket clients for real-time alert broadcasting
connected_alert_clients: List[WebSocket] = []

CAM2_ENABLED = os.getenv("CAM2_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
CAM2_NAME = os.getenv("CAM2_NAME", "Sector Bravo")
CAM2_SOURCE_TYPE = os.getenv("CAM2_SOURCE_TYPE", "EDGE_NODE")
CAM2_STREAM_URL = os.getenv("CAM2_STREAM_URL", "").strip()
EDGE_NODE_MODE = os.getenv("EDGE_NODE", "false").lower() in {"1", "true", "yes", "on"}
EDGE_CAMERA_INDEX = int(os.getenv("EDGE_CAMERA_INDEX", "0"))


def get_remote_camera() -> Optional[RemoteCameraStreamer]:
    global remote_camera
    if not CAM2_ENABLED or not CAM2_STREAM_URL:
        return None
    if remote_camera is None or remote_camera.stream_url != CAM2_STREAM_URL:
        if remote_camera:
            remote_camera.stop()
        remote_camera = RemoteCameraStreamer(CAM2_STREAM_URL)
        remote_camera.start()
    return remote_camera


async def broadcast_alert_to_clients(alert_payload: Dict[str, Any]):
    """Broadcasts a real security alert to all active command center WebSocket connections."""
    dead_clients = []
    for client in connected_alert_clients:
        try:
            await client.send_text(json.dumps(alert_payload))
        except Exception:
            dead_clients.append(client)
    for dead in dead_clients:
        if dead in connected_alert_clients:
            connected_alert_clients.remove(dead)


# -----------------------------------------------------------------
# 1. System Telemetry & Status APIs
# -----------------------------------------------------------------

@app.get("/")
async def serve_index():
    return {
        "service": "IBVAP — Intelligent Border Video Analytics Platform Backend",
        "status": "OPERATIONAL",
        "yolo_detector": pipeline.yolo_detector.status(),
        "face_engine": "YuNet + SFace-128D (ONNX)",
        "anpr_pipeline": pipeline.plate_detector.status(),
        "incident_fusion": "IBVAP Multi-Camera Correlation Engine ACTIVE",
        "frontend": "http://localhost:5173",
        "sih_code": "SIH 26187",
        "timestamp": time.time()
    }


@app.get("/api/status")
async def get_system_status():
    """Returns operational status of all AI models, tracking engines, and hardware."""
    yolo_stat = pipeline.yolo_detector.status()
    anpr_stat = pipeline.plate_detector.status()
    ocr_stat = pipeline.plate_ocr.status()

    return {
        "system": "IBVAP — Intelligent Border Video Analytics Platform",
        "code": "SIH 26187",
        "status": "OPERATIONAL",
        "analytics_enabled": pipeline.analytics_enabled,
        "models": {
            "object_detector": f"Ultralytics YOLO ({yolo_stat.get('model', 'yolov8n.pt')} - 80 COCO Classes)",
            "detector_device": yolo_stat.get("device", "cpu"),
            "detector_status": yolo_stat.get("status", "ONLINE"),
            "custom_object_detection": yolo_stat.get("custom_object_detection", "NOT CONFIGURED"),
            "weapon_detection": yolo_stat.get("weapon_detection", "NOT CONFIGURED"),
            "structure_detection": yolo_stat.get("structure_detection", "NOT CONFIGURED"),
            "supported_structure_classes": yolo_stat.get("supported_structure_classes", []),
            "face_detector": "YuNet ONNX DNN",
            "face_recognizer": "SFace 128D ONNX Feature Extractor",
            "face_watchlist_count": len(pipeline.face_matcher.list_identities()),
            "anpr_detector": anpr_stat.get("status"),
            "anpr_ocr": ocr_stat.get("status"),
            "emotion_classifier": "FER+ ResNet Deep Neural Net (ONNX Diagnostic - Non-Threat)"
        },
        "tracker": {
            "active_tracks_count": len(pipeline.tracker.tracks),
            "max_disappeared": pipeline.tracker.max_disappeared,
            "classes": ["person", "car", "truck", "bus", "motorcycle", "bicycle", "everyday_objects (80 COCO)"]
        },
        "target_fps": "25-30 FPS",
        "timestamp": time.time()
    }


@app.get("/api/ai/status")
async def get_ai_status():
    return await get_system_status()


# -----------------------------------------------------------------
# 2. Camera Management APIs
# -----------------------------------------------------------------

@app.get("/api/cameras")
async def get_cameras():
    """Returns configured border CCTV camera channels."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, sector, source_type, stream_url, status, is_active, fps FROM cameras")
        rows = cursor.fetchall()
        conn.close()
        cameras = [dict(r) for r in rows]
    except Exception:
        cameras = []

    # Also include enumerated local physical devices
    physical = OpenCVCameraStreamer.list_available_cameras(max_tested=2)
    return {"cameras": cameras, "physical_devices": physical}


@app.get("/api/cameras/cam2/status")
async def get_cam2_status():
    camera = get_remote_camera()
    status = camera.status() if camera else {
        "connected": False,
        "stream_status": "DISABLED" if not CAM2_ENABLED else "OFFLINE",
        "resolution": None,
        "latency_ms": None,
        "error": "CAM2_STREAM_URL is not configured" if CAM2_ENABLED else "CAM-02 disabled",
    }
    return {
        "id": "CAM-02",
        "name": CAM2_NAME,
        "source_type": CAM2_SOURCE_TYPE,
        "enabled": CAM2_ENABLED,
        **status,
    }


# -----------------------------------------------------------------
# 3. Real-time Detection, Track, ANPR & Event APIs
# -----------------------------------------------------------------

@app.get("/api/tracks")
async def get_active_tracks():
    """Returns currently tracked persons (P-xxx) and vehicles (V-xxx) with telemetry."""
    active = [trk.to_dict() for trk in pipeline.tracker.tracks.values() if trk.disappeared_count == 0]
    return {
        "count": len(active),
        "tracks": active,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/detections")
async def get_detections(limit: int = 50):
    """Returns recent real object detections from the database."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, camera_id, timestamp, class_name, category, confidence, bbox_json, track_id
            FROM detections
            ORDER BY id DESC LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        conn.close()
        return {"detections": [dict(r) for r in rows]}
    except Exception as e:
        return {"detections": [], "error": str(e)}


@app.get("/api/anpr")
async def get_anpr_events(limit: int = 50):
    """Returns logged ANPR reading events from the database."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, camera_id, vehicle_track_id, plate_text, ocr_confidence, timestamp, snapshot_path, status
            FROM anpr_events
            ORDER BY id DESC LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        conn.close()
        return {"anpr_events": [dict(r) for r in rows]}
    except Exception as e:
        return {"anpr_events": [], "error": str(e)}


@app.get("/api/events")
async def get_security_events(limit: int = 50):
    """Returns logged real-time security events (zone intrusions, fence crossings, loitering)."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, camera_id, event_type, severity, title, details, track_id, confidence, timestamp, snapshot_path
            FROM security_events
            ORDER BY id DESC LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        conn.close()
        return {"events": [dict(r) for r in rows]}
    except Exception as e:
        return {"events": [], "error": str(e)}


# -----------------------------------------------------------------
# 4. Face Recognition & Watchlist Database APIs
# -----------------------------------------------------------------

@app.get("/api/known-suspects")
async def list_known_suspects():
    """Lists enrolled face identities (safe view without exposing raw embedding vectors)."""
    identities = pipeline.face_matcher.list_identities()
    return {"count": len(identities), "suspects": identities}


@app.post("/api/known-suspects")
async def enroll_known_suspect(
    person_code: str = Form(...),
    display_name: str = Form(...),
    status: str = Form("WATCHLIST"),
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """Enrolls a new subject into the facial recognition watchlist."""
    metadata = {"notes": notes or "Tactical Watchlist Record"}
    embedding = None

    if file:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            faces = pipeline.face_detector.detect(img)
            if faces:
                best_face = max(faces, key=lambda f: f["confidence"])
                embedding = pipeline.face_extractor.extract_embedding(img, best_face["raw_face"])

    if embedding is None:
        # Generate dummy 128D normalized vector for placeholder enrollment if no face detected in image
        dummy = np.random.randn(128).astype(np.float32)
        embedding = dummy / np.linalg.norm(dummy)

    ok = pipeline.face_matcher.enroll_face(
        person_code=person_code.strip(),
        display_name=display_name.strip(),
        embedding=embedding,
        status=status.upper(),
        metadata=metadata
    )

    if ok:
        return {"success": True, "person_code": person_code, "status": "ENROLLED"}
    raise HTTPException(status_code=500, detail="Failed to enroll suspect")


@app.delete("/api/known-suspects/{suspect_id}")
async def delete_known_suspect(suspect_id: int):
    """Deletes an enrolled identity by ID."""
    ok = pipeline.face_matcher.delete_identity(suspect_id)
    if ok:
        return {"success": True, "deleted_id": suspect_id}
    raise HTTPException(status_code=404, detail="Identity ID not found")


# -----------------------------------------------------------------
# 5. Zone Configuration APIs
# -----------------------------------------------------------------

@app.get("/api/zone/config")
async def get_zone_config(camera_id: str = "CAM-01"):
    from backend.ai.zone_analyzer import DEFAULT_ZONE
    try:
        zone = pipeline.zone_analyzer.get_zone(camera_id)
        return {
            "camera_id": camera_id,
            "zone": zone,
            "camera_zones": pipeline.zone_analyzer.camera_zones,
            "bunker_zones": fusion_engine.bunker_camera_zones,
            "loitering_threshold": pipeline.zone_analyzer.loitering_threshold,
        }
    except Exception:
        return {"zone": DEFAULT_ZONE, "loitering_threshold": 20}


@app.post("/api/zone/config")
async def set_zone_config(payload: Dict[str, Any]):
    try:
        cam_id = payload.get("camera_id", "CAM-01")
        if "zone" in payload:
            pipeline.zone_analyzer.set_zone(payload["zone"], camera_id=cam_id)
            if cam_id in ("CAM-03", "CAM-04"):
                z = payload["zone"]
                fusion_engine.update_bunker_zone(cam_id, {
                    "zone_name": z.get("name"),
                    "zone_type": z.get("zone_type"),
                    "asset_name": z.get("asset_name"),
                    "nx": z.get("nx"),
                    "ny": z.get("ny"),
                    "nw": z.get("nw"),
                    "nh": z.get("nh"),
                })
        if "loitering_threshold" in payload:
            pipeline.zone_analyzer.set_loitering_threshold(float(payload["loitering_threshold"]))
        return {
            "status": "updated",
            "camera_id": cam_id,
            "zone": pipeline.zone_analyzer.get_zone(cam_id),
            "camera_zones": pipeline.zone_analyzer.camera_zones,
            "bunker_zones": fusion_engine.bunker_camera_zones,
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


# -----------------------------------------------------------------
# 6. Multi-Camera Intelligence, Bunker Demo & Protected Assets APIs
# -----------------------------------------------------------------

@app.get("/api/incidents/fusion")
async def get_incident_fusion_state():
    """Returns current IBVAP multi-camera correlation state, bunker zones, protected assets, timeline, snapshots, and 'What is happening now'."""
    return fusion_engine.get_intelligence_summary()


@app.get("/api/demo/media")
async def get_demo_media_catalog():
    """Returns configured demo/simulation media sources for CAM-03 and CAM-04."""
    return {
        "demo_media": fusion_engine.get_demo_media_catalog(),
        "bunker_zones": fusion_engine.bunker_camera_zones,
        "protected_assets": fusion_engine.protected_assets,
        "structure_model": "NOT CONFIGURED",
    }


@app.post("/api/incidents/bunker-demo")
async def trigger_bunker_intruder_demo_endpoint():
    """
    Runs the real YOLOv8 + Tracker + Bunker Zone Intruder Demo scenario on CAM-03 and CAM-04
    using the demo video/frames in public/demo/incidents/, saving BEFORE / EVENT / AFTER replay
    snapshots and raising a PROTECTED-AREA INTRUSION alert labeled [DEMO / SIMULATION].
    """
    demo_result = fusion_engine.run_bunker_intruder_demo(pipeline=pipeline)
    if demo_result.get("alert"):
        await broadcast_alert_to_clients({
            "type": "alert_event",
            "event": demo_result["alert"],
            "timestamp": time.strftime("%H:%M:%S")
        })
    return demo_result


@app.post("/api/incidents/demo-fusion")
async def trigger_sih_demo_fusion_endpoint():
    """
    Triggers the SIH Judge Demonstration Multi-Camera Correlation workflow:
    Correlates CAM-02, CAM-03, CAM-04 while keeping CAM-01 normal,
    raises MULTI-CAMERA SECURITY ALERT, and prioritizes CAM-03.
    """
    demo_result = fusion_engine.trigger_sih_demo_fusion()
    if demo_result.get("alert"):
        await broadcast_alert_to_clients({
            "type": "alert_event",
            "event": demo_result["alert"],
            "timestamp": time.strftime("%H:%M:%S")
        })
    return demo_result


@app.post("/api/incidents/acknowledge")
async def acknowledge_incident_endpoint(payload: Optional[Dict[str, Any]] = None):
    """Acknowledges an active incident and clears priority camera override."""
    inc_id = (payload or {}).get("incident_id")
    ack_res = fusion_engine.acknowledge_incident(inc_id)
    summary = fusion_engine.get_intelligence_summary()
    summary["acknowledge_result"] = ack_res
    summary["acknowledged_incident"] = ack_res.get("acknowledged_incident")
    return summary


@app.post("/api/incidents/clear-priority")
async def clear_priority_camera_endpoint():
    """Clears automatic primary incident camera prioritization override."""
    fusion_engine.clear_priority_camera()
    return fusion_engine.get_intelligence_summary()


@app.get("/api/incidents/snapshots")
async def get_incident_snapshots():
    """Returns preserved HIGH/CRITICAL incident evidence snapshots."""
    return {"snapshots": fusion_engine.snapshots}


@app.get("/api/assets")
async def get_protected_assets():
    """Returns Protected Asset monitoring statuses (OUTPOST ALPHA, CHECKPOINT DELTA, FORWARD GATE ALPHA)."""
    fusion_engine._sync_protected_assets()
    return {
        "protected_assets": fusion_engine.protected_assets,
        "bunker_zones": fusion_engine.bunker_camera_zones,
        "supported_asset_types": fusion_engine.get_intelligence_summary().get("supported_asset_types", []),
        "structure_model": "NOT CONFIGURED",
    }


@app.post("/api/assets")
async def configure_protected_asset(payload: Dict[str, Any]):
    """Updates or adds a Protected Asset and optionally updates its camera bunker zone."""
    assets = fusion_engine.update_protected_asset(payload)
    cam_id = payload.get("camera_id")
    if cam_id in ("CAM-01", "CAM-02", "CAM-03", "CAM-04") and "zone" in payload:
        pipeline.zone_analyzer.set_zone(payload["zone"], camera_id=cam_id)
        if cam_id in ("CAM-03", "CAM-04"):
            fusion_engine.update_bunker_zone(cam_id, payload["zone"])
    return {
        "status": "updated",
        "protected_assets": assets,
        "bunker_zones": fusion_engine.bunker_camera_zones,
    }


# -----------------------------------------------------------------
# 6B. REST Analyze Frame Fallback
# -----------------------------------------------------------------

@app.post("/api/analyze-frame")
async def analyze_uploaded_frame(
    file: UploadFile = File(...),
    confidence: float = Form(0.40),
    engine: str = Form("yunet"),
    camera_id: str = Form("CAM-01"),
    is_demo: bool = Form(False),
):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        return JSONResponse({"error": "Invalid image format"}, status_code=400)

    t0 = time.time()
    result = pipeline.process_frame(
        frame,
        confidence_threshold=confidence,
        engine=engine,
        camera_id=camera_id,
        is_demo=is_demo,
        scenario_label="SCENARIO: BORDER INTRUSION — SIMULATION" if is_demo else None,
    )
    dt = (time.time() - t0) * 1000
    result["latency_ms"] = round(dt, 2)
    result["sync"] = storage.status()
    result["fusion"] = fusion_engine.update_from_pipeline(camera_id, result, frame_bgr=frame, latency_ms=dt)
    return result


# -----------------------------------------------------------------
# 7. WebSocket Stream Endpoint (Core Real-time Video Ingest)
# -----------------------------------------------------------------

@app.websocket("/ws/stream")
async def websocket_video_stream(websocket: WebSocket):
    """
    Bidirectional WebSocket pipeline for camera video ingestion & telemetry.
    Receives JPEG base64 frames from React dashboard (live or demo video/image),
    executes unified multi-object AI pipeline, and returns normalized bounding boxes,
    tracks, protected zone state, face matches, and alerts.
    """
    await websocket.accept()
    logger.info("Command Center CCTV WebSocket connected.")

    frame_save_counter = 0

    try:
        while True:
            raw_data = await websocket.receive_text()
            t_recv = time.time()
            data = json.loads(raw_data)

            msg_type = data.get("type", "frame")

            # Config messages from dashboard controls
            if msg_type == "config":
                if "analytics_enabled" in data:
                    pipeline.analytics_enabled = bool(data["analytics_enabled"])
                if "confidence_threshold" in data:
                    pipeline.yolo_detector.confidence_threshold = float(data["confidence_threshold"])
                if "network_online" in data:
                    storage.set_network_state(bool(data["network_online"]))
                await websocket.send_text(json.dumps({"type": "config_ack", "status": "updated"}))
                continue

            # Process incoming camera frame
            if msg_type == "frame":
                image_data = data.get("image", "")
                conf_thresh = float(data.get("confidence_threshold", 0.40))
                cam_id = data.get("camera_id", "CAM-01")
                is_demo = bool(data.get("is_demo", cam_id in ("CAM-03", "CAM-04")))
                scenario_label = data.get(
                    "scenario_label",
                    "SCENARIO: BORDER INTRUSION — SIMULATION" if is_demo else None
                )
                source_mode = data.get("source_mode")
                if cam_id in ("CAM-03", "CAM-04") and source_mode:
                    fusion_engine.update_bunker_zone(cam_id, {"source_mode": source_mode, "is_demo": is_demo})

                if not image_data:
                    continue

                if "," in image_data:
                    image_data = image_data.split(",", 1)[1]

                img_bytes = base64.b64decode(image_data)
                np_arr = np.frombuffer(img_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is None:
                    continue

                # Run unified surveillance pipeline for the specific camera_id
                analysis = pipeline.process_frame(
                    frame,
                    confidence_threshold=conf_thresh,
                    camera_id=cam_id,
                    is_demo=is_demo,
                    scenario_label=scenario_label,
                )

                latency_ms = round((time.time() - t_recv) * 1000, 1)

                # Update Multi-Camera Incident Fusion Engine (also saves snapshots for HIGH/CRITICAL alerts)
                fusion_state = fusion_engine.update_from_pipeline(
                    camera_id=cam_id,
                    analysis=analysis,
                    frame_bgr=frame,
                    latency_ms=latency_ms
                )

                # Broadcast new AI alerts to alerts WebSocket hub
                new_alerts = analysis.get("ai_alerts", [])
                if new_alerts:
                    for alt in new_alerts:
                        asyncio.create_task(broadcast_alert_to_clients({
                            "type": "alert_event",
                            "event": alt,
                            "timestamp": time.strftime("%H:%M:%S")
                        }))

                # Persist periodic detections into SQLite (every 10 frames)
                frame_save_counter += 1
                if frame_save_counter % 10 == 0:
                    try:
                        conn = get_db_connection()
                        cur = conn.cursor()
                        now_iso = datetime.now(timezone.utc).isoformat()
                        for trk in analysis.get("tracks", []):
                            cur.execute("""
                                INSERT INTO detections (camera_id, timestamp, class_name, category, confidence, bbox_json, track_id)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (
                                cam_id, now_iso, trk["class_name"], trk["category"], trk["confidence"], json.dumps(trk["bbox"]), trk["track_id"]
                            ))
                        conn.commit()
                        conn.close()
                    except Exception:
                        pass

                # Return full tactical telemetry response
                response_payload = {
                    "type": "telemetry",
                    "camera_id": cam_id,
                    "is_demo": is_demo,
                    "scenario_label": scenario_label,
                    "timestamp": time.time(),
                    "latency_ms": latency_ms,
                    "targets": analysis["targets"],
                    "vehicles": analysis["vehicles"],
                    "tracks": analysis["tracks"],
                    "frame_size": analysis["frame_size"],
                    "protected_zone": analysis.get("protected_zone"),
                    "structure_detection": analysis.get("structure_detection", "NOT CONFIGURED"),
                    "alerts": analysis["alerts"],
                    "ai_alerts": analysis["ai_alerts"],
                    "ai_events": analysis["ai_events"],
                    "total_faces": analysis["total_faces"],
                    "high_threat_count": analysis["high_threat_count"],
                    "face_matches": analysis["face_matches"],
                    "anpr_events": analysis["anpr_events"],
                    "threat_score": analysis["threat_score"],
                    "contributing_signals": analysis.get("contributing_signals", []),
                    "threat_reasons": analysis.get("threat_reasons", []),
                    "zone_intrusions": analysis["zone_intrusions"],
                    "loitering_count": analysis["loitering_count"],
                    "sync": storage.status(),
                    "analytics_enabled": pipeline.analytics_enabled,
                    "other_objects": analysis.get("other_objects", []),
                    "relationships": analysis.get("relationships", []),
                    "person_activity_cards": analysis.get("person_activity_cards", []),
                    "fusion": fusion_state,
                    "ai_stats": analysis["ai_stats"]
                }

                await websocket.send_text(json.dumps(response_payload))

    except WebSocketDisconnect:
        logger.info("CCTV WebSocket client disconnected.")
    except Exception as e:
        logger.debug(f"WebSocket session exception: {e}")
        try:
            await websocket.close()
        except Exception:
            pass


# -----------------------------------------------------------------
# 8. WebSocket Alerts Hub
# -----------------------------------------------------------------

@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    """
    Real-time alert broadcast hub for Command Center notifications.
    """
    await websocket.accept()
    connected_alert_clients.append(websocket)

    # Initial ACK
    await websocket.send_text(json.dumps({
        "type": "connection_ack",
        "status": "TACTICAL_ALERT_HUB_ACTIVE",
        "timestamp": time.time()
    }))

    try:
        while True:
            raw_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            data = json.loads(raw_msg)
            # Drill trigger support
            if data.get("action") == "trigger_demo_alert":
                drill_alert = {
                    "id": f"ALT-{int(time.time() * 10) % 90000 + 10000}",
                    "severity": "CRITICAL",
                    "title": "COMMAND DRILL: Perimeter Breach Simulated [DEMO / SIMULATION]",
                    "camera": "CAM-01",
                    "sector": "Sector Alpha",
                    "targetId": "DRILL_#01",
                    "confidence": 99,
                    "timestamp": time.strftime("%H:%M:%S"),
                    "status": "ACTIVE",
                    "description": "Tactical perimeter security drill initiated by Command Officer.",
                    "explainability": {
                        "what": "Command Drill Perimeter Breach Simulation",
                        "where": "CAM-01 / Sector Alpha",
                        "when": time.strftime("%H:%M:%S"),
                        "object": "Simulated Drill Subject (DRILL_#01)",
                        "why": "Manual Command Drill triggered by operator for response verification.",
                        "confidence": 99
                    },
                    "is_real_ai": False,
                    "is_demo": True
                }
                await broadcast_alert_to_clients({
                    "type": "alert_event",
                    "event": drill_alert
                })
            elif data.get("action") == "trigger_sih_demo_fusion":
                demo_res = fusion_engine.trigger_sih_demo_fusion()
                if demo_res.get("alert"):
                    await broadcast_alert_to_clients({
                        "type": "alert_event",
                        "event": demo_res["alert"]
                    })
            elif data.get("action") == "trigger_bunker_demo":
                demo_res = fusion_engine.run_bunker_intruder_demo(pipeline=pipeline)
                if demo_res.get("alert"):
                    await broadcast_alert_to_clients({
                        "type": "alert_event",
                        "event": demo_res["alert"]
                    })
    except asyncio.TimeoutError:
        # Periodic heartbeat
        try:
            await websocket.send_text(json.dumps({
                "type": "heartbeat",
                "server_time": time.strftime("%H:%M:%S"),
                "status": "ARMED"
            }))
        except Exception:
            pass
    except (WebSocketDisconnect, Exception):
        if websocket in connected_alert_clients:
            connected_alert_clients.remove(websocket)


# -----------------------------------------------------------------
# 9. MJPEG Video Streams (Multi-Camera Grid)
# -----------------------------------------------------------------

def generate_stream_manager_mjpeg(camera_id: str):
    """Generator for simulated/managed camera feeds (cam2, cam3, cam4)."""
    while True:
        frame_bytes = stream_manager.get_frame(camera_id)
        if frame_bytes:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            )
        time.sleep(0.04)  # ~25 FPS


def generate_local_camera_mjpeg():
    """Generator for direct physical backend webcam."""
    global backend_camera
    if backend_camera is None:
        backend_camera = OpenCVCameraStreamer(0)
        backend_camera.start()

    while True:
        frame = backend_camera.get_latest_frame()
        if frame is not None:
            ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ret:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
                )
        time.sleep(0.033)


@app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        generate_local_camera_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/video_feed/{camera_id}")
def video_feed_by_id(camera_id: str):
    if camera_id in ["cam2", "cam3", "cam4"]:
        return StreamingResponse(
            generate_stream_manager_mjpeg(camera_id),
            media_type="multipart/x-mixed-replace; boundary=frame"
        )
    elif camera_id in ["cam1", "cam01"]:
        return StreamingResponse(
            generate_local_camera_mjpeg(),
            media_type="multipart/x-mixed-replace; boundary=frame"
        )
    else:
        raise HTTPException(status_code=404, detail=f"Camera feed '{camera_id}' not found")


@app.get("/edge/video_feed")
def edge_video_feed():
    global edge_camera
    if not EDGE_NODE_MODE:
        return JSONResponse({"error": "EDGE_NODE mode is disabled"}, status_code=404)
    if edge_camera is None:
        edge_camera = OpenCVCameraStreamer(EDGE_CAMERA_INDEX)
        if not edge_camera.start():
            return JSONResponse({"error": "No webcam available on edge node"}, status_code=503)
    return StreamingResponse(
        generate_local_camera_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
