"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Phase 1: Foundational Command Center Dashboard & Video Streaming Grid
FastAPI Application Entrypoint
"""

import os
import time
import json
import asyncio
from typing import Dict, Any, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from jinja2 import Environment, FileSystemLoader

from backend.stream_generators import stream_manager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Ensure required directories exist
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# Initialize Jinja2 environment
jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))

app = FastAPI(
    title="IBVAP - Intelligent Border Video Analytics Platform",
    description="Phase 1: Security Operations Center Dashboard & 2x2 CCTV Grid (SIH 26187)",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Connected WebSocket clients for alert broadcasting
connected_clients: List[WebSocket] = []

# Mock KPI State for Demo Mode
kpi_state = {
    "total_cameras": "4 (3 Online / 1 Standby)",
    "active_alerts": 0,
    "intrusions": 0,
    "persons_detected": 0,
    "vehicles_logged": 0,
    "system_status": "LOCAL SECURE"
}


@app.get("/", response_class=HTMLResponse)
async def index_dashboard():
    """Renders the main SOC Command Center dashboard."""
    template = jinja_env.get_template("index.html")
    return template.render(
        kpi=kpi_state,
        title="IBVAP — Command Center Dashboard"
    )


@app.get("/api/kpis")
async def get_kpis():
    """REST endpoint for dashboard telemetry and KPI counters."""
    return JSONResponse(kpi_state)


def generate_mjpeg_stream(camera_id: str):
    """Generator for multipart MJPEG video stream."""
    while True:
        frame_bytes = stream_manager.get_frame(camera_id)
        if frame_bytes:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            )
        time.sleep(0.035) # ~28 FPS


@app.get("/video_feed/{camera_id}")
async def video_feed(camera_id: str):
    """
    MJPEG streaming endpoint for simulated border channels:
    - cam2: BOP-01 Perimeter (Sector Alpha)
    - cam3: BOP-02 Riverine (Restricted Buffer)
    - cam4: BOP-03 Checkpost-Alpha
    """
    if camera_id not in ["cam2", "cam3", "cam4"]:
        raise HTTPException(status_code=404, detail=f"Camera ID '{camera_id}' not found")

    return StreamingResponse(
        generate_mjpeg_stream(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    """
    Real-time WebSocket hub for telemetry broadcasts, heartbeat, and alert logging.
    """
    await websocket.accept()
    connected_clients.append(websocket)

    # Send initial handshake and state
    await websocket.send_text(json.dumps({
        "type": "connection_ack",
        "status": "SECURE_LINK_ACTIVE",
        "kpis": kpi_state,
        "timestamp": time.time()
    }))

    try:
        # Background task for periodic telemetry heartbeats and demo events
        demo_events = [
            {"source": "BOP-01", "level": "INFO", "msg": "Sector Alpha perimeter fence sensor link nominal."},
            {"source": "BOP-02", "level": "INFO", "msg": "Riverine thermal hydro-sonar radar active. No surface wake."},
            {"source": "CHECKPOST-03", "level": "INFO", "msg": "Barrier gate sensor armed. RFID laser scanner operating."},
            {"source": "CAM-01 [LOCAL]", "level": "SUCCESS", "msg": "Local tactical optical ingest synchronized @ 30 FPS."}
        ]
        event_idx = 0

        while True:
            # Check for incoming client messages with timeout
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=4.0)
                client_data = json.loads(msg)
                # Handle client actions (e.g., alert acknowledged or test trigger)
                if client_data.get("action") == "trigger_demo_alert":
                    kpi_state["active_alerts"] += 1
                    kpi_state["intrusions"] += 1
                    await websocket.send_text(json.dumps({
                        "type": "alert_event",
                        "event": {
                            "source": "CAM-01 [LOCAL]",
                            "level": "ALERT",
                            "msg": "MANUAL DRILL: Tactical perimeter intrusion simulated.",
                            "timestamp": time.strftime("%H:%M:%S")
                        },
                        "kpis": kpi_state
                    }))
            except asyncio.TimeoutError:
                # Periodic heartbeat & telemetry sync
                event = demo_events[event_idx % len(demo_events)]
                event_idx += 1
                await websocket.send_text(json.dumps({
                    "type": "heartbeat",
                    "telemetry": {
                        "server_time": time.strftime("%H:%M:%S") + f".{int(time.time() * 1000) % 1000:03d}",
                        "active_channels": 4,
                        "kpis": kpi_state
                    },
                    "log_sample": {
                        "source": event["source"],
                        "level": event["level"],
                        "msg": event["msg"],
                        "timestamp": time.strftime("%H:%M:%S")
                    }
                }))

    except WebSocketDisconnect:
        if websocket in connected_clients:
            connected_clients.remove(websocket)
    except Exception:
        if websocket in connected_clients:
            connected_clients.remove(websocket)


if __name__ == "__main__":
    import uvicorn
    print("\n===================================================================")
    print("  IBVAP — INTELLIGENT BORDER VIDEO ANALYTICS PLATFORM [PHASE 1]    ")
    print("  Command Center SOC & 2x2 CCTV Grid                              ")
    print("  Listening on http://127.0.0.1:8000                              ")
    print("===================================================================\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
