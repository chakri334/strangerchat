"""
Tests for the Feb 22 behavioral changes:

1. /api/active-users now hides non-Google users (Telegram, guests, email-OTP).
2. Hotlist add/remove no longer touches messages (pure contact bookmark).
3. Every new message gets expires_at = next Monday 00:00 UTC.
"""
import os
import sys
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _new_user(label="mon"):
    email = f"TEST_{label}_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/email/send-otp",
                      json={"email": email, "name": f"TEST {label}"},
                      headers={"x-admin-token": "stumblechat_admin_2026"}, timeout=10)
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    r2 = requests.post(f"{BASE_URL}/api/auth/email/verify-otp",
                       json={"email": email, "code": code, "name": f"TEST {label}"}, timeout=10)
    assert r2.status_code == 200, r2.text
    u = r2.json()["user"]
    return u["session_token"], u["user_id"]


# ── Monday purge helper ──────────────────────────────────────────────────────
class TestNextMonday:
    def test_helper_returns_next_monday_at_midnight(self):
        from routers.conversations import next_monday_utc
        d = next_monday_utc()
        now = datetime.now(timezone.utc)
        assert d.weekday() == 0, "must be Monday"
        assert d.hour == 0 and d.minute == 0 and d.second == 0
        assert d > now, "must be strictly in the future"
        # Within the next 7 days
        assert (d - now).days <= 7


# ── Active-users Google-only filter ─────────────────────────────────────────
class TestActiveUsersGoogleOnly:
    def test_email_otp_user_not_in_active_users(self):
        """Even after registering via Socket.IO, an email-OTP user must NOT appear in /api/active-users."""
        import socketio as sio_client

        token_a, uid_a = _new_user("hiddenA")
        token_b, uid_b = _new_user("viewerB")

        async def register(token, uid):
            c = sio_client.AsyncClient(reconnection=False)
            await c.connect(BASE_URL, socketio_path="/api/socket.io", transports=["polling"])
            await c.emit("register_user", {
                "name": f"TEST_{uid[:6]}",
                "city": "MONDAY_TEST_CITY",
                "session_token": token,
            })
            await asyncio.sleep(0.5)
            return c

        async def run():
            ca = await register(token_a, uid_a)
            cb = await register(token_b, uid_b)
            try:
                r = requests.get(
                    f"{BASE_URL}/api/active-users",
                    headers=_auth(token_b),
                    timeout=10,
                )
                return r.json()
            finally:
                await ca.disconnect()
                await cb.disconnect()

        body = asyncio.run(run())
        ids = [u.get("user_id") for u in body.get("users", [])]
        # Neither email-OTP user should appear in viewer B's directory
        assert uid_a not in ids, f"Email-OTP user {uid_a} leaked into directory: {ids}"


# ── Hotlist contact-bookmark only ────────────────────────────────────────────
class TestHotlistContactsOnly:
    def test_hotlist_add_does_not_touch_messages(self):
        token_a, uid_a = _new_user("hotA")
        token_b, uid_b = _new_user("hotB")

        # Send a baseline message — should already have expires_at = next Monday
        r = requests.post(f"{BASE_URL}/api/conversations/{uid_b}/messages",
                          headers=_auth(token_a), json={"text": "before-pin"}, timeout=10)
        assert r.status_code == 200, r.text

        # Snapshot expires_at via GET /messages
        msgs_before = requests.get(
            f"{BASE_URL}/api/conversations/{uid_b}/messages",
            headers=_auth(token_a), timeout=10,
        ).json()["messages"]
        baseline = next((m for m in msgs_before if m.get("text") == "before-pin"), None)
        assert baseline is not None
        baseline_exp = baseline.get("expires_at")
        assert baseline_exp is not None, "Baseline message must have expires_at"

        # Pin user B
        r = requests.post(f"{BASE_URL}/api/hotlist/{uid_b}", headers=_auth(token_a), timeout=10)
        assert r.status_code == 200

        # The message's expires_at must NOT have changed
        msgs_after = requests.get(
            f"{BASE_URL}/api/conversations/{uid_b}/messages",
            headers=_auth(token_a), timeout=10,
        ).json()["messages"]
        after = next((m for m in msgs_after if m.get("text") == "before-pin"), None)
        assert after is not None
        assert after.get("expires_at") == baseline_exp, \
            "Hotlist add must NOT modify message expires_at"

    def test_new_message_expires_next_monday(self):
        from routers.conversations import next_monday_utc

        token_a, uid_a = _new_user("monA")
        token_b, uid_b = _new_user("monB")

        r = requests.post(f"{BASE_URL}/api/conversations/{uid_b}/messages",
                          headers=_auth(token_a), json={"text": "monday-test"}, timeout=10)
        assert r.status_code == 200, r.text

        msgs = requests.get(
            f"{BASE_URL}/api/conversations/{uid_b}/messages",
            headers=_auth(token_a), timeout=10,
        ).json()["messages"]
        m = next((x for x in msgs if x.get("text") == "monday-test"), None)
        assert m is not None
        assert m.get("expires_at") is not None, "New message must carry expires_at"

        # Parse ISO and compare against helper
        actual = datetime.fromisoformat(m["expires_at"].replace("Z", "+00:00"))
        if actual.tzinfo is None:
            actual = actual.replace(tzinfo=timezone.utc)
        expected_monday = next_monday_utc()
        delta = abs((actual - expected_monday).total_seconds())
        assert delta <= 2, f"expires_at {actual} != next Monday {expected_monday} (delta {delta}s)"
