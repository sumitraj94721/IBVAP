"""
IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
Authentication & Role-Based Authorization Router
Provides /auth/login, /auth/logout, /auth/me, /auth/audit-logs, and protected surveillance endpoints.
"""

import time
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel

from backend.auth_service import (
    authenticate_credentials,
    create_session_token,
    verify_session_token,
    SESSION_COOKIE_NAME,
    DEMO_BYPASS_AUTH,
    get_demo_officer
)
from backend.audit_service import audit_event, get_audit_logs

auth_router = APIRouter(tags=["Authentication & Security"])


class LoginRequest(BaseModel):
    user_id: Optional[str] = None
    username: Optional[str] = None
    password: str
    remember_me: bool = False


class AuditEmitRequest(BaseModel):
    action: str
    target: str
    details: Optional[str] = None


class FenceModifyRequest(BaseModel):
    camera_id: str
    zone_name: str
    coordinates: List[List[float]]
    status: Optional[str] = "ARMED"


class AlertAcknowledgeRequest(BaseModel):
    alert_id: str
    notes: Optional[str] = None


class QRTDispatchRequest(BaseModel):
    incident_id: str
    threat_source: str
    threat_details: str
    qrt_unit: str
    sound_siren: bool = False
    lockdown_gate: bool = False


# -------------------------------------------------------------
# Dependencies for Role-Based Access Control
# -------------------------------------------------------------
async def get_current_officer(request: Request) -> Optional[Dict[str, Any]]:
    """
    Extracts and verifies officer session from HTTP-only cookie or Authorization header.
    """
    # 1. Check HTTP-only cookie
    token = request.cookies.get(SESSION_COOKIE_NAME)
    # 2. Check Authorization: Bearer <token>
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if token:
        officer = verify_session_token(token)
        if officer:
            return officer

    if DEMO_BYPASS_AUTH:
        return get_demo_officer()
    return None


async def require_authenticated_officer(
    officer: Optional[Dict[str, Any]] = Depends(get_current_officer)
) -> Dict[str, Any]:
    """Ensures caller has an active, cryptographically verified session."""
    if not officer:
        raise HTTPException(
            status_code=401,
            detail="Access Denied: Authentication Required. Please login to the tactical terminal."
        )
    return officer


async def require_level_4_commander(
    officer: Dict[str, Any] = Depends(require_authenticated_officer)
) -> Dict[str, Any]:
    """
    Strict authorization gate: Only Level 4 High Command personnel allowed.
    Level 2 Field Controllers receive HTTP 403 Forbidden.
    """
    clearance = officer.get("clearance_level", 0)
    if clearance < 4:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Level 4 High Command Clearance Required. Insufficient privilege level."
        )
    return officer


# -------------------------------------------------------------
# Authentication Routes
# -------------------------------------------------------------
@auth_router.post("/auth/login")
@auth_router.post("/api/auth/login")
@auth_router.post("/api/login")
@auth_router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    """
    Authenticates military credentials, logs audit event, and sets HTTP-only session cookie.
    """
    target_user_id = (req.user_id or req.username or "").strip()
    officer = authenticate_credentials(target_user_id, req.password)
    if not officer:
        # Audit failed login attempt
        audit_event(
            user_id=target_user_id,
            action="LOGIN_FAILED",
            target="AUTH_TERMINAL",
            details="Rejected: Invalid credentials provided",
            request=request
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid admin credentials"
        )

    token = create_session_token(officer, remember=req.remember_me)
    max_age = 604800 if req.remember_me else 86400

    # Set secure HTTP-only cookie
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=max_age,
        samesite="lax",
        secure=False # Set to True in production HTTPS
    )

    # Audit successful login
    audit_event(
        user_id=officer["user_id"],
        action="LOGIN",
        target="AUTH_TERMINAL",
        details=f"Authenticated as {officer['full_name']} ({officer['rank']}, Level {officer['clearance_level']})",
        request=request
    )

    return {
        "status": "AUTHENTICATED",
        "message": f"Welcome, {officer['full_name']}. Terminal session established.",
        "officer": officer,
        "token": token,
        "redirect": "/dashboard"
    }


@auth_router.post("/auth/logout")
@auth_router.post("/api/auth/logout")
@auth_router.post("/api/logout")
@auth_router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    officer: Optional[Dict[str, Any]] = Depends(get_current_officer)
):
    """Terminates officer session and records audit entry."""
    if officer:
        audit_event(
            user_id=officer["user_id"],
            action="LOGOUT",
            target="AUTH_TERMINAL",
            details=f"Officer {officer['user_id']} signed out of terminal",
            request=request
        )

    response.delete_cookie(key=SESSION_COOKIE_NAME)
    return {"status": "LOGGED_OUT", "message": "Terminal session terminated.", "redirect": "/login"}


@auth_router.get("/auth/me")
@auth_router.get("/api/auth/me")
@auth_router.get("/api/me")
@auth_router.get("/me")
async def get_current_officer_profile(
    officer: Dict[str, Any] = Depends(require_authenticated_officer)
):
    """Returns authenticated officer profile."""
    return {
        "status": "ACTIVE_SESSION",
        "officer": officer
    }


# -------------------------------------------------------------
# Audit Logs (Level 4 High Command Restricted)
# -------------------------------------------------------------
@auth_router.get("/auth/audit-logs")
@auth_router.get("/api/audit/logs")
async def fetch_audit_logs(
    limit: int = 100,
    offset: int = 0,
    officer: Dict[str, Any] = Depends(require_level_4_commander)
):
    """
    Returns full-spectrum officer audit trail.
    STRICTLY RESTRICTED TO LEVEL 4 COMMANDERS.
    """
    logs = get_audit_logs(limit=limit, offset=offset)
    return {
        "status": "SUCCESS",
        "count": len(logs),
        "requested_by": officer["user_id"],
        "logs": logs
    }


@auth_router.post("/api/audit/emit")
async def emit_ui_audit_action(
    req: AuditEmitRequest,
    request: Request,
    officer: Dict[str, Any] = Depends(require_authenticated_officer)
):
    """
    Receives frontend UI audit events (e.g. camera switch) and binds them
    authoritatively to the verified session officer on the backend.
    """
    log_id = audit_event(
        user_id=officer["user_id"],
        action=req.action,
        target=req.target,
        details=req.details,
        request=request
    )
    return {"status": "LOGGED", "audit_id": log_id}


# -------------------------------------------------------------
# Protected Tactical Actions
# -------------------------------------------------------------
@auth_router.post("/api/camera/switch")
async def audit_camera_switch(
    request: Request,
    camera_id: str,
    officer: Dict[str, Any] = Depends(require_authenticated_officer)
):
    """Audits camera selection or switch."""
    audit_event(
        user_id=officer["user_id"],
        action="SWITCH_CAMERA",
        target=camera_id,
        details=f"Operator switched display to {camera_id}",
        request=request
    )
    return {"status": "SUCCESS", "camera": camera_id}


@auth_router.post("/api/fence/modify")
async def modify_virtual_fence(
    req: FenceModifyRequest,
    request: Request,
    officer: Dict[str, Any] = Depends(require_level_4_commander)
):
    """
    Modifies virtual fence or exclusion polygon zone.
    RESTRICTED TO LEVEL 4 COMMANDERS.
    """
    details_str = f"Zone: {req.zone_name} | Coords: {len(req.coordinates)} vertices | Status: {req.status}"
    audit_event(
        user_id=officer["user_id"],
        action="ALTER_VIRTUAL_FENCE",
        target=req.camera_id,
        details=details_str,
        request=request
    )
    return {
        "status": "MODIFIED",
        "camera_id": req.camera_id,
        "zone_name": req.zone_name,
        "authorized_by": officer["user_id"],
        "message": f"Virtual fence configuration updated on {req.camera_id} by {officer['full_name']}."
    }


@auth_router.post("/api/alerts/acknowledge")
async def acknowledge_alert(
    req: AlertAcknowledgeRequest,
    request: Request,
    officer: Dict[str, Any] = Depends(require_authenticated_officer)
):
    """
    Acknowledges operational alert and attaches authenticated first_responder_id.
    """
    audit_event(
        user_id=officer["user_id"],
        action="ACKNOWLEDGE_ALERT",
        target=req.alert_id,
        details=req.notes or f"Alert acknowledged by {officer['full_name']}",
        request=request
    )
    return {
        "status": "ACKNOWLEDGED",
        "alert_id": req.alert_id,
        "first_responder_id": officer["user_id"],
        "officer_name": officer["full_name"],
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }


@auth_router.post("/api/qrt/dispatch")
@auth_router.post("/api/alerts/escalate")
async def dispatch_qrt(
    req: QRTDispatchRequest,
    request: Request,
    officer: Dict[str, Any] = Depends(require_authenticated_officer)
):
    """
    Dispatches Quick Reaction Team (QRT), deploys countermeasures, and
    binds the incident to the authenticated officer's first_responder_id.
    """
    actions = []
    if req.sound_siren:
        actions.append("PERIMETER_SIREN_ACTIVE")
    if req.lockdown_gate:
        actions.append("GATE_02_LOCKDOWN_DEPLOYED")

    actions_str = ", ".join(actions) if actions else "QRT_DISPATCHED_ONLY"
    ts_str = time.strftime("%Y-%m-%d %H:%M:%S")

    # Authoritative audit log
    audit_event(
        user_id=officer["user_id"],
        action="DISPATCH_QRT",
        target=req.incident_id,
        details=f"Unit: {req.qrt_unit} | Actions: {actions_str}",
        request=request
    )

    return {
        "status": "ESCALATED",
        "incident_id": req.incident_id,
        "first_responder_id": officer["user_id"],
        "dispatched_unit": req.qrt_unit,
        "officer": {
            "user_id": officer["user_id"],
            "name": officer["full_name"],
            "rank": officer["rank"],
            "clearance_level": officer["clearance_level"]
        },
        "defensive_actions": actions,
        "timestamp": ts_str,
        "signature_hash": f"SIG-{officer['user_id']}-{int(time.time()) % 100000}",
        "message": f"{req.qrt_unit} dispatched by {officer['full_name']} ({officer['user_id']})."
    }
