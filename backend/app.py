"""
AI Border Surveillance CCTV Command Center (SIH 26187)
FastAPI Backend Application
Provides REST endpoints, WebSockets stream processing, and static UI serving.
"""

import os
import sys
import time
import base64
import json
import logging
from typing import Dict, Any, Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.face_pipeline import SurveillanceVisionPipeline
from backend.camera_streamer import OpenCVCameraStreamer, RemoteCameraStreamer
from backend.storage_sync import StorageSyncManager
from backend.auth_router import auth_router

# AI Feature modules (degrade gracefully if unavailable)
try:
    from backend.ai.event_engine import EventEngine
    _event_engine = EventEngine(camera_id="CAM-01")
except Exception as _ee_err:
    _event_engine = None
    logging.getLogger("IBVAP.Backend").warning(f"EventEngine unavailable: {_ee_err}")

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
    title="AI Border Surveillance CCTV Command Center (SIH 26187)",
    description="Real-time facial detection, bounding box tracking, and emotion analysis backend",
    version="1.0.0"
)

# Enable CORS for external dashboard integration if required
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Authentication & Tactical Incident Router
app.include_router(auth_router)

# Global Vision Pipeline
pipeline = SurveillanceVisionPipeline(engine="yunet")
storage = StorageSyncManager(project_root=PROJECT_ROOT)
backend_camera: Optional[OpenCVCameraStreamer] = None
edge_camera: Optional[OpenCVCameraStreamer] = None
remote_camera: Optional[RemoteCameraStreamer] = None
last_event_at: Dict[str, float] = {}

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

# Mount snapshots directory
if os.path.exists(SNAPSHOT_DIR):
    app.mount("/static/snapshots", StaticFiles(directory=SNAPSHOT_DIR), name="snapshots")


@app.get("/")
async def serve_index():
    """Backend status endpoint. (User-facing UI is served via React at http://localhost:5173)."""
    return {
        "service": "IBVAP Backend / AI Processing Engine",
        "status": "OPERATIONAL",
        "engine": pipeline.detector.engine,
        "frontend": "http://localhost:5173",
        "sih_code": "SIH 26187",
        "timestamp": time.time()
    }



@app.get("/api/status")
async def get_system_status():
    """Returns telemetry and status of backend models."""
    return {
        "system": "AI Border Surveillance CCTV Command Center",
        "code": "SIH 26187",
        "status": "OPERATIONAL",
        "engine": pipeline.detector.engine,
        "analytics_enabled": pipeline.analytics_enabled,
        "models": {
            "face_detector": "YuNet DNN ONNX / Haar Cascade Fallback",
            "emotion_classifier": "FER+ ResNet Deep Neural Net (ONNX)",
            "classes": 8
        },
        "target_fps": "25-30 FPS",
        "timestamp": time.time()
    }


@app.get("/api/cameras")
async def get_available_cameras():
    """Enumerates local physical camera devices via OpenCV."""
    cameras = OpenCVCameraStreamer.list_available_cameras(max_tested=3)
    return {"cameras": cameras}


@app.get("/api/cameras/cam2/status")
async def get_cam2_status():
    """Returns live configuration and connectivity for the remote CAM-02 node."""
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


@app.get("/api/events/pending")
async def get_pending_events():
    """Returns buffered edge events waiting for central synchronization."""
    return {"events": storage.pending_events(), **storage.status()}


@app.get("/api/sync/status")
async def get_sync_status():
    return storage.status()


@app.post("/api/sync/network")
async def set_network_state(payload: Dict[str, Any]):
    """Toggle simulated communications without changing event history."""
    if "online" not in payload:
        return JSONResponse({"error": "online boolean is required"}, status_code=400)
    return storage.set_network_state(bool(payload["online"]))


@app.post("/api/analyze-frame")
async def analyze_uploaded_frame(
    file: UploadFile = File(...),
    confidence: float = Form(0.5),
    engine: str = Form("yunet")
):
    """
    REST fallback endpoint: Upload an image file for immediate face and emotion analysis.
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        return JSONResponse({"error": "Invalid image format"}, status_code=400)

    t0 = time.time()
    result = pipeline.process_frame(frame, confidence_threshold=confidence, engine=engine)
    dt = (time.time() - t0) * 1000
    result["latency_ms"] = round(dt, 2)
    result["sync"] = storage.status()
    return result


@app.get("/api/zone/config")
async def get_zone_config():
    """Returns current restricted zone configuration."""
    from backend.ai.zone_analyzer import DEFAULT_ZONE
    try:
        zone = pipeline.zone_analyzer.zones[0] if pipeline.zone_analyzer.zones else DEFAULT_ZONE
        return {"zone": zone, "loitering_threshold": pipeline.zone_analyzer.loitering_threshold}
    except Exception:
        return {"zone": DEFAULT_ZONE, "loitering_threshold": 20}


@app.post("/api/zone/config")
async def set_zone_config(payload: Dict[str, Any]):
    """Update restricted zone and loitering threshold."""
    try:
        if "zone" in payload:
            pipeline.zone_analyzer.set_zone(payload["zone"])
        if "loitering_threshold" in payload:
            pipeline.zone_analyzer.set_loitering_threshold(float(payload["loitering_threshold"]))
        return {"status": "updated", "zone": pipeline.zone_analyzer.zones}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/ai/status")
async def get_ai_status():
    """Returns status of all AI modules."""
    od_status = "OFFLINE"
    od_model = "N/A"
    if pipeline.object_detector:
        od_status = pipeline.object_detector.status()
        od_model = pipeline.object_detector.model_name
    return {
        "face_detector": pipeline.detector.engine,
        "emotion_model": "FER+ ResNet ONNX",
        "object_detector": od_status,
        "object_detector_model": od_model,
        "zone_analyzer": "ONLINE",
        "event_engine": "ONLINE" if _event_engine else "OFFLINE",
        "analytics_enabled": pipeline.analytics_enabled,
    }


@app.websocket("/ws/stream")
async def websocket_video_stream(websocket: WebSocket):
    """
    Ultra-low latency WebSocket stream endpoint.
    Receives JPEG base64 webcam frames from browser client,
    processes with YuNet + FER+ ResNet, and returns coordinates & emotion telemetry.
    """
    await websocket.accept()
    logger.info("CCTV WebSocket client connected.")

    try:
        while True:
            raw_data = await websocket.receive_text()
            t_recv = time.time()
            data = json.loads(raw_data)

            msg_type = data.get("type", "frame")

            # Handle runtime config updates from dashboard controls
            if msg_type == "config":
                if "analytics_enabled" in data:
                    pipeline.analytics_enabled = bool(data["analytics_enabled"])
                if "engine" in data:
                    pipeline.detector.set_engine(data["engine"])
                if "confidence_threshold" in data:
                    pipeline.detector.set_confidence_threshold(float(data["confidence_threshold"]))
                if "network_online" in data:
                    storage.set_network_state(bool(data["network_online"]))
                await websocket.send_text(json.dumps({"type": "config_ack", "status": "updated"}))
                continue

            # Process incoming camera frame
            if msg_type == "frame":
                image_data = data.get("image", "")
                confidence = float(data.get("confidence_threshold", 0.5))
                engine = data.get("engine", "yunet")

                if not image_data:
                    continue

                # Strip base64 prefix if present
                if "," in image_data:
                    image_data = image_data.split(",", 1)[1]

                # Decode JPEG buffer
                img_bytes = base64.b64decode(image_data)
                np_arr = np.frombuffer(img_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is None:
                    continue

                # Run unified surveillance pipeline
                analysis = pipeline.process_frame(
                    frame,
                    confidence_threshold=confidence,
                    engine=engine,
                    vehicle_detections=data.get("vehicle_detections", [])
                )

                now = time.time()

                # Smart alerts from EventEngine (debounced)
                ai_alerts = []
                ai_events = []
                session_threat = 0
                persons_count = analysis.get("total_faces", 0)
                vehicles_count = len(analysis.get("vehicles", []))
                objects_count = len(analysis.get("od_objects", []))
                zone_intrusions = 0
                loitering_count = 0

                if _event_engine:
                    try:
                        ee_result = _event_engine.process(
                            enriched_targets=analysis.get("targets", []),
                            object_detections=analysis.get("objects", []),
                            frame_size=analysis.get("frame_size", {}),
                        )
                        ai_alerts = ee_result.get("alerts", [])
                        ai_events = ee_result.get("events", [])
                        session_threat = ee_result.get("session_threat_score", 0)
                        zone_intrusions = ee_result.get("zone_intrusions", 0)
                        loitering_count = ee_result.get("loitering_count", 0)

                        # Scored targets override the pipeline targets
                        scored_targets = ee_result.get("targets_scored", analysis.get("targets", []))
                    except Exception as ee_err:
                        logger.debug(f"EventEngine process error: {ee_err}")
                        scored_targets = analysis.get("targets", [])
                else:
                    scored_targets = analysis.get("targets", [])

                # Original emotion-based storage events (keep existing behavior)
                for alert in analysis["alerts"]:
                    event_key = f"{alert['target_id']}:{alert['expression']}"
                    if now - last_event_at.get(event_key, 0) > 5:
                        storage.record_event("CAM-01", "INTRUSION", "PERSON", alert["level"], frame)
                        last_event_at[event_key] = now
                for vehicle in analysis["vehicles"]:
                    vtype = vehicle.get("object_type", "VEHICLE")
                    event_key = f"VEHICLE:{vtype}"
                    if now - last_event_at.get(event_key, 0) > 10:
                        storage.record_event("CAM-01", "ANPR", vtype, "MEDIUM", frame)
                        last_event_at[event_key] = now

                latency_ms = round((time.time() - t_recv) * 1000, 2)

                # Extended telemetry payload (backward-compatible: existing fields preserved)
                response_payload = {
                    "type": "telemetry",
                    "timestamp": time.time(),
                    "latency_ms": latency_ms,
                    "targets": scored_targets,
                    "frame_size": analysis["frame_size"],
                    "alerts": analysis["alerts"],
                    "total_faces": analysis["total_faces"],
                    "high_threat_count": analysis["high_threat_count"],
                    "faces": analysis["faces"],
                    "vehicles": analysis["vehicles"],
                    "sync": storage.status(),
                    "analytics_enabled": pipeline.analytics_enabled,
                    # ── NEW AI Fields ──────────────────────────────────────
                    "objects": analysis.get("od_objects", []),
                    "od_persons": analysis.get("od_persons", []),
                    "od_vehicles": analysis.get("od_vehicles", []),
                    "ai_alerts": ai_alerts,
                    "ai_events": ai_events,
                    "threat_score": session_threat,
                    "zone_intrusions": zone_intrusions,
                    "loitering_count": loitering_count,
                    "ai_stats": {
                        **analysis.get("ai_stats", {}),
                        "persons_count": persons_count,
                        "vehicles_count": vehicles_count,
                        "objects_count": objects_count,
                        "zone_intrusions": zone_intrusions,
                        "loitering_count": loitering_count,
                        "latency_ms": latency_ms,
                        "face_engine": pipeline.detector.engine,
                        "emotion_model": "FER+ ResNet ONNX",
                    },
                }

                await websocket.send_text(json.dumps(response_payload))


    except WebSocketDisconnect:
        logger.info("CCTV WebSocket client disconnected.")
    except Exception as e:
        logger.error(f"WebSocket session exception: {e}")
        try:
            await websocket.close()
        except:
            pass


def generate_mjpeg():
    """Generator for direct backend OpenCV camera streaming."""
    global backend_camera
    if backend_camera is None:
        backend_camera = OpenCVCameraStreamer(0)
        backend_camera.start()

    while True:
        frame = backend_camera.get_latest_frame()
        if frame is not None:
            # Run analytics directly
            analysis = pipeline.process_frame(frame)
            # Draw tactical overlay onto frame
            for target in analysis["targets"]:
                x, y, w, h = target["box"]
                emotion = target["emotion"]["primary_expression"]
                conf = target["emotion"]["confidence"]
                # Tech box
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 136), 2)
                cv2.putText(
                    frame,
                    f"[{target['target_id']}] {emotion} ({conf:.0f}%)",
                    (x, max(20, y - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 136),
                    2
                )

            ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ret:
                frame_bytes = buffer.tobytes()
                yield (b"--frame\r\n"
                       b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
        time.sleep(0.033)


def generate_remote_mjpeg(camera: RemoteCameraStreamer):
    """Re-encodes real remote frames and runs them through the shared AI pipeline."""
    while True:
        frame = camera.get_latest_frame()
        if frame is not None:
            pipeline.process_frame(frame)
            ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if ret:
                yield (b"--frame\r\n"
                       b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
        time.sleep(0.033)


def generate_edge_mjpeg(camera: OpenCVCameraStreamer):
    """Serves the edge laptop's physical webcam as a real MJPEG stream."""
    while True:
        frame = camera.get_latest_frame()
        if frame is not None:
            ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if ret:
                yield (b"--frame\r\n"
                       b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
        time.sleep(0.033)


@app.get("/video_feed")
def video_feed():
    """MJPEG stream endpoint for backend-driven OpenCV camera streaming."""
    return StreamingResponse(
        generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/video_feed/cam2")
def cam2_video_feed():
    """Streams CAM-02 from the configured remote edge node when enabled."""
    camera = get_remote_camera()
    if camera is None:
        return JSONResponse({"error": "CAM-02 is disabled or not configured"}, status_code=503)
    return StreamingResponse(
        generate_remote_mjpeg(camera),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/edge/video_feed")
def edge_video_feed():
    """Edge-node endpoint that exposes the teammate laptop's physical webcam."""
    global edge_camera
    if not EDGE_NODE_MODE:
        return JSONResponse({"error": "EDGE_NODE mode is disabled"}, status_code=404)
    if edge_camera is None:
        edge_camera = OpenCVCameraStreamer(EDGE_CAMERA_INDEX)
        if not edge_camera.start():
            return JSONResponse({"error": "No webcam available on edge node"}, status_code=503)
    return StreamingResponse(
        generate_edge_mjpeg(edge_camera),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
