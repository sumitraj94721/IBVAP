"""
IBVAP — Intelligent Border Video Analytics Platform (SIH 2026)
Phase 1: Foundational Command Center Dashboard & Video Streaming Grid
FastAPI Application Entrypoint
"""

import os
import time
import json
import asyncio
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, Response
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from jinja2 import Environment, FileSystemLoader

from backend.stream_generators import stream_manager
from backend.auth_router import auth_router, get_current_officer
from backend.auth_service import SESSION_COOKIE_NAME, create_session_token, authenticate_credentials, DEMO_BYPASS_AUTH
from backend.audit_service import audit_event

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Ensure required directories exist
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# Initialize Jinja2 environment
jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))

app = FastAPI(
    title="IBVAP — Intelligent Border Video Analytics Platform",
    description="Security Operations Center Dashboard & 2x2 CCTV Grid (SIH 2026)",
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

# Include RBAC Authentication & Tactical Incident Router
app.include_router(auth_router)

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
async def root_entry(
    request: Request,
    officer: Optional[Dict[str, Any]] = Depends(get_current_officer)
):
    """
    Entry point for IBVAP.
    If authenticated -> renders main SOC Command Center dashboard.
    If not logged in -> redirects to /login.
    """
    if not officer:
        return RedirectResponse(url="/login", status_code=303)

    template = jinja_env.get_template("index.html")
    return template.render(
        kpi=kpi_state,
        officer=officer,
        title="IBVAP — Intelligent Border Video Analytics Platform | SIH 2026"
    )


@app.get("/login", response_class=HTMLResponse)
async def login_page(
    request: Request,
    officer: Optional[Dict[str, Any]] = Depends(get_current_officer)
):
    """Dedicated login route."""
    if officer:
        return RedirectResponse(url="/", status_code=303)
    template = jinja_env.get_template("login.html")
    return template.render(title="IBVAP — Command Terminal Login")


@app.post("/login")
@app.post("/api/login")
async def api_login(request: Request, response: Response):
    """
    Accepts form or JSON admin credentials for the SIH prototype login.
    Demo credentials: admin / admin123.
    """
    user_id = ""
    password = ""
    remember = True

    content_type = request.headers.get("content-type", "")
    is_json = "application/json" in content_type

    if is_json:
        try:
            body = await request.json()
            user_id = str(body.get("user_id") or body.get("username") or "").strip()
            password = str(body.get("password") or body.get("access_key") or "")
        except Exception:
            pass
    else:
        try:
            form = await request.form()
            user_id = str(form.get("user_id") or form.get("username") or "").strip()
            password = str(form.get("password") or form.get("access_key") or "")
        except Exception:
            pass

    officer = authenticate_credentials(user_id, password)

    if not officer:
        audit_event(
            user_id=user_id or "UNKNOWN",
            action="LOGIN_FAILED",
            target="IBVAP_COMMAND_HUB",
            details="Rejected: Invalid credentials",
            request=request
        )
        if is_json:
            raise HTTPException(status_code=401, detail="Invalid admin credentials")
        template = jinja_env.get_template("login.html")
        return HTMLResponse(
            template.render(title="IBVAP Admin Login", error="Invalid admin credentials"),
            status_code=401
        )
        if is_json:
            raise HTTPException(
                status_code=401,
                detail="AUTHENTICATION FAILED — INVALID CREDENTIALS"
            )
        template = jinja_env.get_template("login.html")
        return HTMLResponse(template.render(title="IBVAP — Login"), status_code=401)

    token = create_session_token(officer, remember=remember)
    max_age = 604800 if remember else 86400

    audit_event(
        user_id=officer["user_id"],
        action="LOGIN",
        target="IBVAP_COMMAND_HUB",
        details=f"Authenticated as {officer['full_name']} ({officer['rank']})",
        request=request
    )

    if is_json:
        res = JSONResponse({
            "success": True,
            "redirect": "/",
            "status": "AUTHENTICATED",
            "officer": officer,
            "token": token
        })
    else:
        res = RedirectResponse(url="/", status_code=303)

    res.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=max_age,
        samesite="lax",
        secure=False
    )
    return res


@app.api_route("/api/logout", methods=["GET", "POST"])
@app.get("/logout")
async def api_logout(request: Request):
    """Clears session cookie and redirects to /login."""
    officer = await get_current_officer(request)
    if officer:
        audit_event(
            user_id=officer["user_id"],
            action="LOGOUT",
            target="AUTH_TERMINAL",
            details=f"Officer {officer['user_id']} logged out",
            request=request
        )
    response = RedirectResponse(url="/login", status_code=303)
    response.delete_cookie(key=SESSION_COOKIE_NAME)
    return response


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(
    request: Request,
    officer: Optional[Dict[str, Any]] = Depends(get_current_officer)
):
    """
    Protected dashboard route.
    Redirects unauthenticated visitors to /login.
    """
    if not officer:
        return RedirectResponse(url="/login", status_code=303)

    template = jinja_env.get_template("index.html")
    return template.render(
        kpi=kpi_state,
        officer=officer,
        title="IBVAP — Intelligent Border Video Analytics Platform | SIH 2026"
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
async def video_feed(
    camera_id: str,
    officer: Optional[Dict[str, Any]] = Depends(get_current_officer)
):
    """
    MJPEG streaming endpoint for simulated border channels:
    - cam2: BOP-01 Perimeter (Sector Alpha)
    - cam3: BOP-02 Riverine (Restricted Buffer)
    - cam4: BOP-03 Checkpost-Alpha
    Restricted to authenticated surveillance officers.
    """
    if not officer:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized Video Access: Active officer authentication required."
        )

    if camera_id not in ["cam2", "cam3", "cam4"]:
        raise HTTPException(status_code=404, detail=f"Camera ID '{camera_id}' not found")

    return StreamingResponse(
        generate_mjpeg_stream(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.websocket("/ws/stream")
async def websocket_stream_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for live video stream and vision pipeline telemetry.
    Checks session cookie in handshake. If unauthenticated, closes cleanly with code 1008 (Policy Violation).
    """
    officer = await get_current_officer(websocket)
    if not officer and not DEMO_BYPASS_AUTH:
        await websocket.close(code=1008, reason="Authentication required")
        return

    await websocket.accept()
    await websocket.send_text(json.dumps({
        "type": "connection_ack",
        "status": "STREAM_ACTIVE",
        "officer": officer.get("user_id"),
        "timestamp": time.time()
    }))

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "timestamp": time.time()}))
                else:
                    await websocket.send_text(json.dumps({
                        "type": "stream_telemetry",
                        "status": "NOMINAL",
                        "fps": 30,
                        "targets": [],
                        "timestamp": time.time()
                    }))
            except Exception:
                await websocket.send_text(json.dumps({"type": "ack", "status": "RECEIVED"}))
    except (WebSocketDisconnect, Exception):
        pass


@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    """
    Real-time WebSocket hub for telemetry broadcasts, heartbeat, and alert logging.
    Checks session cookie in handshake. If unauthenticated, closes cleanly with code 1008 (Policy Violation).
    """
    officer = await get_current_officer(websocket)
    if not officer and not DEMO_BYPASS_AUTH:
        await websocket.close(code=1008, reason="Authentication required")
        return

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
