"""
Backend tests for the new tabbed StumbleChat (iteration 4):
- /api/profile/me  (GET / PUT) with cookie + Bearer auth
- /api/active-users  (new fields + interests filter)
- Existing endpoints regression: /api/stats, /api/check-ip, /api/admin/*, /api/auth/me
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', "stumblechat_admin_2026")


# --------- helpers -------------------------------------------------------
def _new_email():
    return f"TEST_profile_{int(time.time() * 1000)}_{os.getpid()}@example.com"


def _login_via_otp(email=None):
    """Run send-otp + verify-otp, return (session_token, user_dict)."""
    email = email or _new_email()
    r = requests.post(f"{BASE_URL}/api/auth/email/send-otp", json={"email": email})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code")
    assert code and len(code) == 6

    r = requests.post(
        f"{BASE_URL}/api/auth/email/verify-otp",
        json={"email": email, "code": code, "name": email.split("@")[0]},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    return data["user"]["session_token"], data["user"]


@pytest.fixture(scope="module")
def auth_session():
    token, user = _login_via_otp()
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


# --------- /api/profile/me -----------------------------------------------
class TestProfileMe:
    def test_get_profile_me_unauthenticated_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/profile/me")
        assert r.status_code == 401
        j = r.json()
        assert j.get("ok") is False

    def test_get_profile_me_with_bearer_returns_defaults(self, auth_session):
        r = requests.get(f"{BASE_URL}/api/profile/me", headers=auth_session["headers"])
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        p = j["profile"]
        # All defaults present
        assert p.get("bio", None) == ""
        assert p.get("gender", None) == ""
        assert p.get("interested_in", None) == ""
        assert p.get("interests") == []
        assert p.get("images") == []
        # Core identity fields
        assert p["user_id"] == auth_session["user"]["user_id"]
        assert p["email"] == auth_session["user"]["email"]
        # MongoDB _id must not leak
        assert "_id" not in p

    def test_put_profile_me_unauthenticated_returns_401(self):
        r = requests.put(f"{BASE_URL}/api/profile/me", json={"bio": "hi"})
        assert r.status_code == 401

    def test_put_profile_me_updates_and_validates(self, auth_session):
        long_bio = "x" * 500  # should be truncated to 280
        many_tags = [f"tag{i}" for i in range(20)]  # should be capped to 10
        body = {
            "bio": long_bio,
            "gender": "female",
            "interested_in": "both",
            "interests": many_tags + ["MUSIC", "  Gaming  ", ""],
            "images": ["data:image/png;base64,AAA"] * 8,  # cap 5
        }
        r = requests.put(f"{BASE_URL}/api/profile/me",
                         json=body, headers=auth_session["headers"])
        assert r.status_code == 200, r.text
        prof = r.json()["profile"]
        assert len(prof["bio"]) == 280
        assert prof["gender"] == "female"
        assert prof["interested_in"] == "both"
        assert len(prof["interests"]) == 10  # capped
        # Interests lower-cased and trimmed
        assert all(t == t.lower().strip() for t in prof["interests"])
        assert len(prof["images"]) == 5

        # GET to verify persistence
        r2 = requests.get(f"{BASE_URL}/api/profile/me", headers=auth_session["headers"])
        assert r2.status_code == 200
        p2 = r2.json()["profile"]
        assert p2["gender"] == "female"
        assert p2["interested_in"] == "both"
        assert len(p2["interests"]) == 10
        assert len(p2["images"]) == 5

    def test_put_profile_me_invalid_gender_ignored(self, auth_session):
        # Invalid enum value should be ignored (not saved)
        r = requests.put(f"{BASE_URL}/api/profile/me",
                         json={"gender": "alien"}, headers=auth_session["headers"])
        assert r.status_code == 200
        # The previous value (female) should still be there
        r2 = requests.get(f"{BASE_URL}/api/profile/me", headers=auth_session["headers"])
        assert r2.json()["profile"]["gender"] == "female"

    def test_put_profile_me_empty_string_gender_accepted(self, auth_session):
        r = requests.put(f"{BASE_URL}/api/profile/me",
                         json={"gender": ""}, headers=auth_session["headers"])
        assert r.status_code == 200
        prof = r.json()["profile"]
        assert prof["gender"] == ""


# --------- /api/active-users --------------------------------------------
class TestActiveUsers:
    def test_active_users_returns_list_structure(self):
        r = requests.get(f"{BASE_URL}/api/active-users")
        assert r.status_code == 200
        data = r.json()
        assert "users" in data and isinstance(data["users"], list)
        assert "count" in data
        # If any users present, verify new schema fields are present
        for u in data["users"]:
            for f in ("sid", "name", "city", "emoji", "picture",
                      "interests", "interested_in", "bio", "user_id"):
                assert f in u, f"Field '{f}' missing in active-users response"
            assert isinstance(u["interests"], list)

    def test_active_users_interests_filter_accepts_param(self):
        # Param should be accepted (empty results allowed when no active users)
        r = requests.get(f"{BASE_URL}/api/active-users",
                         params={"interests": "music,gaming"})
        assert r.status_code == 200
        data = r.json()
        assert "users" in data and "count" in data
        # Every returned user must match at least one tag
        for u in data["users"]:
            tags = {t.lower() for t in (u.get("interests") or [])}
            assert tags & {"music", "gaming"}, f"User {u} returned without matching tag"


# --------- regression on existing endpoints ------------------------------
class TestRegression:
    def test_api_root(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json()["message"] == "Chat server running"

    def test_stats(self):
        r = requests.get(f"{BASE_URL}/api/stats")
        assert r.status_code == 200
        for k in ("online", "chats_today", "cities", "city_counts"):
            assert k in r.json()

    def test_check_ip(self):
        r = requests.get(f"{BASE_URL}/api/check-ip")
        assert r.status_code == 200
        assert "blocked" in r.json()

    def test_auth_me_bearer(self, auth_session):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_session["headers"])
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_admin_users_requires_token(self):
        r = requests.get(f"{BASE_URL}/api/admin/users")
        assert r.status_code == 401

    def test_admin_users_ok_with_token(self):
        r = requests.get(f"{BASE_URL}/api/admin/users",
                         headers={"x-admin-token": ADMIN_TOKEN})
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert "users" in data and "total" in data
        for u in data["users"]:
            assert "_id" not in u

    def test_admin_reports_ok_with_token(self):
        r = requests.get(f"{BASE_URL}/api/admin/reports",
                         headers={"x-admin-token": ADMIN_TOKEN})
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert "reports" in data and "total" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
