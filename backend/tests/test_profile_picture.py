"""Backend tests for Profile Picture upload/delete:
- POST /api/profile/picture (multipart): success/auth/wrong type/empty/too-large
- DELETE /api/profile/picture: clears picture
- GET /api/profile/me reflects data URL
Plus regression smoke for /api/conversations, /api/users/search, /api/block, /api/hotlist, /api/active-users.
"""
import io
import os
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://socket-io-staging.preview.emergentagent.com').rstrip('/')


def _png_bytes(width=1, height=1):
    """Build a minimal valid PNG (1x1 black pixel)."""
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)  # RGB
    raw = b'\x00' + b'\x00\x00\x00' * width  # filter=0, one RGB pixel per row
    raw = b''.join([b'\x00' + b'\x00\x00\x00' * width for _ in range(height)])
    idat = zlib.compress(raw)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')


def _make_user(email_suffix: str, name: str = "PicTester"):
    email = f"TEST_pic_{email_suffix}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/email/send-otp", json={"email": email}, timeout=15)
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    r = requests.post(f"{BASE_URL}/api/auth/email/verify-otp",
                      json={"email": email, "code": code, "name": name}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data["user"]["session_token"], data["user"]["user_id"]


def _auth_h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- POST /api/profile/picture ----------

class TestProfilePictureUpload:
    def test_upload_no_auth_returns_401(self):
        png = _png_bytes()
        files = {"file": ("a.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/profile/picture", files=files, timeout=15)
        assert r.status_code == 401, r.text

    def test_upload_valid_png_returns_data_url(self):
        token, _ = _make_user("valid_png")
        png = _png_bytes()
        files = {"file": ("a.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/profile/picture", files=files, headers=_auth_h(token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert isinstance(body.get("picture"), str)
        assert body["picture"].startswith("data:image/png;base64,")

        # GET /api/profile/me should reflect the new data URL
        r2 = requests.get(f"{BASE_URL}/api/profile/me", headers=_auth_h(token), timeout=10)
        assert r2.status_code == 200, r2.text
        prof = r2.json().get("profile") or {}
        assert prof.get("picture", "").startswith("data:image/png;base64,")
        assert prof["picture"] == body["picture"]

    def test_upload_wrong_content_type_returns_400(self):
        token, _ = _make_user("wrong_type")
        files = {"file": ("a.txt", io.BytesIO(b"hello world"), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/profile/picture", files=files, headers=_auth_h(token), timeout=15)
        assert r.status_code == 400, r.text
        assert "JPEG" in r.text or "image" in r.text.lower()

    def test_upload_empty_file_returns_400(self):
        token, _ = _make_user("empty_file")
        files = {"file": ("a.png", io.BytesIO(b""), "image/png")}
        r = requests.post(f"{BASE_URL}/api/profile/picture", files=files, headers=_auth_h(token), timeout=15)
        assert r.status_code == 400, r.text
        assert "empty" in r.text.lower() or "Empty" in r.text

    def test_upload_too_large_returns_413(self):
        token, _ = _make_user("too_large")
        # > 2MB
        big = b"\x00" * (2 * 1024 * 1024 + 1024)
        files = {"file": ("big.png", io.BytesIO(big), "image/png")}
        r = requests.post(f"{BASE_URL}/api/profile/picture", files=files, headers=_auth_h(token), timeout=30)
        assert r.status_code == 413, r.text


# ---------- DELETE /api/profile/picture ----------

class TestProfilePictureDelete:
    def test_delete_no_auth_returns_401(self):
        r = requests.delete(f"{BASE_URL}/api/profile/picture", timeout=15)
        assert r.status_code == 401

    def test_delete_clears_picture(self):
        token, _ = _make_user("delete_pic")
        # Upload first
        png = _png_bytes()
        files = {"file": ("a.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/profile/picture", files=files, headers=_auth_h(token), timeout=15)
        assert r.status_code == 200
        # Sanity: picture present
        prof = requests.get(f"{BASE_URL}/api/profile/me", headers=_auth_h(token), timeout=10).json()["profile"]
        assert prof["picture"].startswith("data:image/")

        # Delete
        r = requests.delete(f"{BASE_URL}/api/profile/picture", headers=_auth_h(token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify cleared
        prof2 = requests.get(f"{BASE_URL}/api/profile/me", headers=_auth_h(token), timeout=10).json()["profile"]
        assert prof2.get("picture", "") == ""


# ---------- REGRESSION SMOKE ----------

class TestRegressionSmoke:
    def test_profile_me_ok(self):
        token, _ = _make_user("smoke_me")
        r = requests.get(f"{BASE_URL}/api/profile/me", headers=_auth_h(token), timeout=10)
        assert r.status_code == 200
        assert "profile" in r.json()

    def test_conversations_list_ok(self):
        token, _ = _make_user("smoke_conv")
        r = requests.get(f"{BASE_URL}/api/conversations", headers=_auth_h(token), timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "conversations" in body
        assert isinstance(body["conversations"], list)

    def test_users_search_empty_query(self):
        token, _ = _make_user("smoke_search")
        r = requests.get(f"{BASE_URL}/api/users/search?stumble_id=@nonexistent_handle_xyz",
                         headers=_auth_h(token), timeout=10)
        # Either 404 or 200 with empty result — just no 500
        assert r.status_code in (200, 404), r.text

    def test_hotlist_toggle_ok(self):
        """No GET /api/hotlist — hotlist surfaces via /api/conversations 'pinned'.
        Smoke the toggle endpoints instead."""
        token_a, uid_a = _make_user("smoke_hot_a")
        token_b, uid_b = _make_user("smoke_hot_b")
        # Add B to A's hotlist
        r = requests.post(f"{BASE_URL}/api/hotlist/{uid_b}", headers=_auth_h(token_a), timeout=10)
        assert r.status_code in (200, 201), r.text
        # Remove
        r2 = requests.delete(f"{BASE_URL}/api/hotlist/{uid_b}", headers=_auth_h(token_a), timeout=10)
        assert r2.status_code in (200, 204), r2.text

    def test_blocked_list_ok(self):
        token, _ = _make_user("smoke_block")
        r = requests.get(f"{BASE_URL}/api/blocked", headers=_auth_h(token), timeout=10)
        assert r.status_code == 200

    def test_active_users_ok(self):
        token, _ = _make_user("smoke_active")
        r = requests.get(f"{BASE_URL}/api/active-users", headers=_auth_h(token), timeout=10)
        assert r.status_code == 200
