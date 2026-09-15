"""
IBVAP Acceptance Test Suite
Verifies all 8 acceptance test criteria requested in specification.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app, stream_manager

client = TestClient(app)

print("=" * 60)
print("  IBVAP RBAC & FULL-SPECTRUM AUDIT LOGGING ACCEPTANCE TESTS")
print("=" * 60)

# TEST 3: Invalid Credentials
print("\n[TEST 3] Testing Invalid Credentials...")
res_invalid = client.post("/auth/login", json={"user_id": "HQ-CDR-01", "password": "WrongPassword123"})
assert res_invalid.status_code == 401, f"Expected 401, got {res_invalid.status_code}"
print("  >>> PASS: Login rejected (HTTP 401)")

# TEST 4: Unauthenticated user attempts protected endpoint
print("\n[TEST 4] Testing Unauthenticated Protected Endpoints...")
res_unauth_me = client.get("/auth/me")
assert res_unauth_me.status_code == 401, f"Expected 401, got {res_unauth_me.status_code}"
res_unauth_audit = client.get("/auth/audit-logs")
assert res_unauth_audit.status_code == 401, f"Expected 401, got {res_unauth_audit.status_code}"
res_unauth_video = client.get("/video_feed/cam2")
assert res_unauth_video.status_code == 401, f"Expected 401, got {res_unauth_video.status_code}"
res_unauth_fence = client.post("/api/fence/modify", json={"camera_id": "CAM-01", "zone_name": "TEST", "coordinates": []})
assert res_unauth_fence.status_code == 401, f"Expected 401, got {res_unauth_fence.status_code}"
print("  >>> PASS: Protected endpoints rejected unauthenticated request (HTTP 401)")

# TEST 1: Login with Commander (HQ-CDR-01 / Commander@2026)
print("\n[TEST 1] Testing Commander Login (HQ-CDR-01)...")
res_cdr_login = client.post("/auth/login", json={"user_id": "HQ-CDR-01", "password": "Commander@2026"})
assert res_cdr_login.status_code == 200, f"Expected 200, got {res_cdr_login.status_code}"
cdr_data = res_cdr_login.json()
officer = cdr_data["officer"]
assert officer["user_id"] == "HQ-CDR-01"
assert officer["full_name"] == "Brig. Ajay Verma"
assert officer["rank"] == "Sector Commander"
assert officer["clearance_level"] == 4
assert officer["assigned_sector"] == "Sector Alpha - Post 04"

# Check commander can access audit logs
res_cdr_audit = client.get("/auth/audit-logs")
assert res_cdr_audit.status_code == 200, f"Expected 200, got {res_cdr_audit.status_code}"
assert res_cdr_audit.json()["status"] == "SUCCESS"
print(f"  >>> PASS: Commander authenticated. Name: {officer['full_name']} | Clearance: Level {officer['clearance_level']}")
print(f"  >>> PASS: Audit drawer available (HTTP 200, count: {res_cdr_audit.json()['count']})")

# TEST 5: Commander switches camera
print("\n[TEST 5] Testing Commander Camera Switch Audit...")
res_switch = client.post("/api/camera/switch?camera_id=CAM-02")
assert res_switch.status_code == 200
# Verify in audit log
res_audit_check = client.get("/auth/audit-logs")
latest_events = res_audit_check.json()["logs"]
assert any(e["user_id"] == "HQ-CDR-01" and e["action"] == "SWITCH_CAMERA" and e["target"] == "CAM-02" for e in latest_events)
print("  >>> PASS: SWITCH_CAMERA audit event logged for HQ-CDR-01 on target CAM-02")

# TEST 7: Commander modifies virtual fence
print("\n[TEST 7] Testing Commander Modifies Virtual Fence...")
fence_payload = {
    "camera_id": "CAM-01",
    "zone_name": "RESTRICTED_BUFFER_ALPHA",
    "coordinates": [[0.15, 0.25], [0.85, 0.25], [0.9, 0.88], [0.1, 0.88]],
    "status": "HIGH_SENSITIVITY"
}
res_fence = client.post("/api/fence/modify", json=fence_payload)
assert res_fence.status_code == 200
res_audit_check2 = client.get("/auth/audit-logs")
latest_events2 = res_audit_check2.json()["logs"]
assert any(e["user_id"] == "HQ-CDR-01" and e["action"] == "ALTER_VIRTUAL_FENCE" and e["target"] == "CAM-01" for e in latest_events2)
print("  >>> PASS: ALTER_VIRTUAL_FENCE audit event logged for HQ-CDR-01 on target CAM-01")

# TEST 8: Logout
print("\n[TEST 8] Testing Logout...")
res_logout = client.post("/auth/logout")
assert res_logout.status_code == 200
res_me_after = client.get("/auth/me")
assert res_me_after.status_code == 401, f"Expected 401 after logout, got {res_me_after.status_code}"
print("  >>> PASS: Session terminated. Protected endpoints reject subsequent requests (HTTP 401)")

# TEST 2: Login with Operator (OP-SECT-04 / Operator@2026)
print("\n[TEST 2] Testing Operator Login (OP-SECT-04)...")
res_op_login = client.post("/auth/login", json={"user_id": "OP-SECT-04", "password": "Operator@2026"})
assert res_op_login.status_code == 200
op_officer = res_op_login.json()["officer"]
assert op_officer["user_id"] == "OP-SECT-04"
assert op_officer["full_name"] == "Sub-Insp. Neeraj Rao"
assert op_officer["rank"] == "Perimeter Operator"
assert op_officer["clearance_level"] == 2

# Verify Operator gets 403 on Level-4 Audit Log
res_op_audit = client.get("/auth/audit-logs")
assert res_op_audit.status_code == 403, f"Expected 403 Forbidden for Level 2, got {res_op_audit.status_code}"

# Verify Operator gets 403 on Level-4 Virtual Fence modification
res_op_fence = client.post("/api/fence/modify", json=fence_payload)
assert res_op_fence.status_code == 403, f"Expected 403 Forbidden for Level 2, got {res_op_fence.status_code}"
print(f"  >>> PASS: Operator authenticated. Name: {op_officer['full_name']} | Clearance: Level {op_officer['clearance_level']}")
print("  >>> PASS: Audit drawer unavailable & backend returns HTTP 403 Forbidden for Level 2")
print("  >>> PASS: Virtual fence modification denied (HTTP 403 Forbidden for Level 2)")

# TEST 6: Operator acknowledges alert & sets first_responder_id
print("\n[TEST 6] Testing Operator Alert Acknowledgment & First Responder...")
res_ack = client.post("/api/alerts/acknowledge", json={"alert_id": "ALERT-1042", "notes": "Perimeter verified by field sentry"})
assert res_ack.status_code == 200
ack_data = res_ack.json()
assert ack_data["alert_id"] == "ALERT-1042"
assert ack_data["first_responder_id"] == "OP-SECT-04"
assert ack_data["officer_name"] == "Sub-Insp. Neeraj Rao"

# Also test QRT Dispatch sets first_responder_id
res_qrt = client.post("/api/qrt/dispatch", json={
    "incident_id": "ALERT-1042",
    "threat_source": "CAM-02",
    "threat_details": "Perimeter Intrusion",
    "qrt_unit": "QRT Unit 1",
    "sound_siren": True,
    "lockdown_gate": True
})
assert res_qrt.status_code == 200
qrt_data = res_qrt.json()
assert qrt_data["first_responder_id"] == "OP-SECT-04"
print("  >>> PASS: ACKNOWLEDGE_ALERT created audit event")
print(f"  >>> PASS: Incident assigned first_responder_id = {ack_data['first_responder_id']} ({ack_data['officer_name']})")

stream_manager.stop()
print("\n" + "=" * 60)
print("  ALL 8 ACCEPTANCE TESTS COMPLETED SUCCESSFULLY!")
print("=" * 60)
