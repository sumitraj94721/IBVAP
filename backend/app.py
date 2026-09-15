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
from backend.camera_streamer import OpenCVCameraStreamer
from backend.storage_sync import StorageSyncManager
from backend.auth_router import auth_router

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
last_event_at: Dict[str, float] = {}

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
                for alert in analysis["alerts"]:
                    event_key = f"{alert['target_id']}:{alert['expression']}"
                    if now - last_event_at.get(event_key, 0) > 5:
                        storage.record_event("CAM-01", "INTRUSION", "PERSON", alert["level"], frame)
                        last_event_at[event_key] = now
                for vehicle in analysis["vehicles"]:
                    storage.record_event("CAM-01", "ANPR", vehicle["object_type"], "MEDIUM", frame)

                latency_ms = round((time.time() - t_recv) * 1000, 2)

                response_payload = {
                    "type": "telemetry",
                    "timestamp": time.time(),
                    "latency_ms": latency_ms,
                    "targets": analysis["targets"],
                    "frame_size": analysis["frame_size"],
                    "alerts": analysis["alerts"],
                    "total_faces": analysis["total_faces"],
                    "high_threat_count": analysis["high_threat_count"],
                    "faces": analysis["faces"],
                    "vehicles": analysis["vehicles"],
                    "sync": storage.status(),
                    "analytics_enabled": pipeline.analytics_enabled
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


@app.get("/video_feed")
def video_feed():
    """MJPEG stream endpoint for backend-driven OpenCV camera streaming."""
    return StreamingResponse(
        generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
