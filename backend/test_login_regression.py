import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import auth_service


def test_database_admin_login_works_when_demo_credentials_disabled():
    original = auth_service.DEMO_CREDENTIALS_ENABLED
    try:
        auth_service.DEMO_CREDENTIALS_ENABLED = False
        officer = auth_service.authenticate_credentials("admin", "admin123")
        assert officer is not None
        assert officer["user_id"] == "admin"
        assert officer["clearance_level"] >= 4
    finally:
        auth_service.DEMO_CREDENTIALS_ENABLED = original


if __name__ == "__main__":
    test_database_admin_login_works_when_demo_credentials_disabled()
    print("login regression check passed")
