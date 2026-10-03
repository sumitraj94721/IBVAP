"""
Unit test for RBAC Authentication, Session Management, and QRT Incident Escalation
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app, stream_manager

client = TestClient(app)

print("1. Testing unauthenticated /api/auth/me...")
res = client.get("/api/auth/me")
assert res.status_code == 401, f"Expected 401, got {res.status_code}"
print("   PASS: Unauthenticated access blocked (401)")

print("2. Testing Operator login (/api/auth/login)...")
login_res = client.post("/api/auth/login", json={"username": "operator1", "password": "Border@2026"})
assert login_res.status_code == 200, f"Expected 200, got {login_res.status_code}"
login_data = login_res.json()
officer = login_data.get("officer", {})
assert officer.get("badge_id") == "BSF-8841"
assert officer.get("clearance_level") == 2
assert officer.get("clearance_label") == "Level 2"
print(f"   PASS: Operator authenticated: {officer.get('name')} ({officer.get('badge_id')}) [{officer.get('clearance_label')}]")

print("3. Testing authenticated /api/auth/me via session cookie...")
me_res = client.get("/api/auth/me")
assert me_res.status_code == 200, f"Expected 200, got {me_res.status_code}"
me_data = me_res.json()
assert me_data["officer"]["badge_id"] == "BSF-8841"
print(f"   PASS: Session verified: {me_data['officer']['name']}")

print("4. Testing Duty Roster (/api/auth/duty-roster)...")
roster_res = client.get("/api/auth/duty-roster")
assert roster_res.status_code == 200, f"Expected 200, got {roster_res.status_code}"
roster = roster_res.json().get("duty_roster", [])
assert len(roster) >= 4
print(f"   PASS: Duty roster returned {len(roster)} online sentry officers:")
for r in roster:
    print(f"     * {r['name']} ({r['badge_id']}) - {r['role']} [{r['clearance_level']}] @ {r['post_name']}")

print("5. Testing QRT Incident Escalation (/api/alerts/escalate)...")
esc_payload = {
    "incident_id": "INC-TRIPWIRE-8821",
    "threat_source": "CAM-01 [LOCAL SECTOR]",
    "threat_details": "Unauthorized perimeter boundary breach detected",
    "qrt_unit": "QRT Unit 1 (Alpha Rapid Response - 4 Commando Team)",
    "sound_siren": True,
    "lockdown_gate": True,
    "flag_officer_sig": True
}
esc_res = client.post("/api/alerts/escalate", json=esc_payload)
assert esc_res.status_code == 200, f"Expected 200, got {esc_res.status_code}"
esc_data = esc_res.json()
assert esc_data["status"] == "ESCALATED"
assert "SIG-" in esc_data["signature_hash"]
print(f"   PASS: Incident escalated: {esc_data['incident_id']}")
print(f"         Assigned Unit: {esc_data['dispatched_unit']}")
print(f"         Digital Signature: {esc_data['signature_hash']}")
print(f"         Defensive Actions: {esc_data['defensive_actions']}")

print("6. Testing Incident Audit Retrieval (/api/alerts/incidents)...")
inc_res = client.get("/api/alerts/incidents")
assert inc_res.status_code == 200
inc_list = inc_res.json().get("incidents", [])
assert len(inc_list) >= 1
latest = inc_list[0]
print(f"   PASS: Incident logged in SQLite: ID={latest['incident_id']} Officer={latest['officer_name']} Signature={latest['signature_hash']}")

print("7. Testing Commander login (/api/auth/login)...")
cmd_login = client.post("/api/auth/login", json={"username": "commander", "password": "Commander@2026"})
assert cmd_login.status_code == 200
cmd_officer = cmd_login.json().get("officer", {})
assert cmd_officer.get("user_id") == "HQ-CDR-01"
assert cmd_officer.get("badge_id") == "BSF-0001"
assert cmd_officer.get("clearance_level") == 4
assert cmd_officer.get("clearance_label") == "Level 4"
print(f"   PASS: Commander authenticated: {cmd_officer.get('name')} [{cmd_officer.get('clearance_label')}]")

print("8. Testing Logout (/api/auth/logout)...")
logout_res = client.post("/api/auth/logout")
assert logout_res.status_code == 200
print("   PASS: Session terminated")

stream_manager.stop()
print("\n>>> ALL RBAC & INCIDENT ESCALATION TESTS PASSED (8/8) <<<")
