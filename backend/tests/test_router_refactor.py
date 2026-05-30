"""
Iteration 7 — router refactor verification.

Ensures every endpoint across the 5 routers responds, Socket.IO and REST
share the same state.py dicts, admin token gating works, and bot.py imports
cleanly without breaking the Telegram /start handler path.
"""
import os
import sys
import uuid
import importlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "stumblechat_admin_2026")

sys.path.insert(0, "/app/backend")


# ────────────────── helpers ──────────────────
def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _new_user(label="ref"):
    """Create user via email-OTP backdoor; returns (token, user_id)."""
    email = f"TEST_router_{label}_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/email/send-otp",
                      json={"email": email, "name": f"TEST {label}"}, timeout=10)
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code")
    assert code, r.json()
    r2 = requests.post(f"{BASE_URL}/api/auth/email/verify-otp",
                       json={"email": email, "code": code, "name": f"TEST {label}"}, timeout=10)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    user = body["user"]
    return user["session_token"], user["user_id"]


# ────────────────── auth router ──────────────────
class TestAuthRouter:
    def test_send_and_verify_otp(self):
        token, uid = _new_user("auth")
        assert token and uid.startswith("user_")

    def test_me_with_bearer(self):
        token, uid = _new_user("me")
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(token), timeout=10)
        assert r.status_code == 200
        body = r.json()
        user = body.get("user", body)
        assert user["user_id"] == uid

    def test_me_unauth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code in (401, 403)


# ────────────────── profile router ──────────────────
class TestProfileRouter:
    def test_profile_me_fields(self):
        token, _ = _new_user("prof")
        r = requests.get(f"{BASE_URL}/api/profile/me", headers=_auth(token), timeout=10)
        assert r.status_code == 200
        body = r.json().get("profile", r.json())
        for k in ("stumble_id", "gender_locked", "images", "picture", "bio", "interests", "interested_in"):
            assert k in body, f"missing key {k}"
        # email-OTP users must NOT be gender-locked
        assert body["gender_locked"] is False

    def test_profile_update_dedup_and_cap(self):
        token, _ = _new_user("upd")
        payload = {
            "bio": "x" * 500,
            "interests": ["A", "a", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
            "interested_in": "women",
            "name": "Updated Name",
            "gender": "male",
        }
        r = requests.put(f"{BASE_URL}/api/profile/me", headers=_auth(token), json=payload, timeout=10)
        assert r.status_code == 200, r.text
        b = r.json().get("profile", r.json())
        assert len(b.get("bio", "")) <= 280
        interests = b.get("interests", [])
        assert len(interests) <= 10
        assert all(i == i.lower() for i in interests)
        assert len(interests) == len(set(interests))

    def test_active_users_self_excluded(self):
        token, uid = _new_user("active")
        r = requests.get(f"{BASE_URL}/api/active-users", headers=_auth(token), timeout=10)
        assert r.status_code == 200
        users = r.json().get("users", r.json())
        # endpoint may return list directly or {users:[]}
        ids = [u.get("user_id") for u in (users if isinstance(users, list) else [])]
        assert uid not in ids

    def test_users_search(self):
        token, _ = _new_user("search1")
        token2, uid2 = _new_user("search2")
        me = requests.get(f"{BASE_URL}/api/profile/me", headers=_auth(token2), timeout=10).json()
        me_profile = me.get("profile", me)
        stumble = me_profile["stumble_id"]
        r = requests.get(f"{BASE_URL}/api/users/search",
                         params={"stumble_id": stumble}, headers=_auth(token), timeout=10)
        assert r.status_code == 200
        assert r.json().get("user", {}).get("user_id") == uid2


# ────────────────── block / hotlist router ──────────────────
class TestBlockRouter:
    def test_block_roundtrip(self):
        ta, _ = _new_user("blkA")
        tb, ub = _new_user("blkB")
        r = requests.post(f"{BASE_URL}/api/block/{ub}", headers=_auth(ta), timeout=10)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/blocked", headers=_auth(ta), timeout=10)
        assert r.status_code == 200
        body = r.json()
        blocked_list = body.get("users") or body.get("blocked") or []
        blocked_ids = [u.get("user_id") for u in blocked_list]
        assert ub in blocked_ids
        r = requests.delete(f"{BASE_URL}/api/block/{ub}", headers=_auth(ta), timeout=10)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/blocked", headers=_auth(ta), timeout=10)
        body = r.json()
        blocked_list = body.get("users") or body.get("blocked") or []
        blocked_ids = [u.get("user_id") for u in blocked_list]
        assert ub not in blocked_ids

    def test_hotlist_roundtrip(self):
        ta, _ = _new_user("hotA")
        tb, ub = _new_user("hotB")
        r = requests.post(f"{BASE_URL}/api/hotlist/{ub}", headers=_auth(ta), timeout=10)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/hotlist", headers=_auth(ta), timeout=10)
        assert r.status_code == 200
        body = r.json()
        items = body.get("users") or body.get("hotlist") or []
        ids = [u.get("user_id") for u in items]
        assert ub in ids
        r = requests.delete(f"{BASE_URL}/api/hotlist/{ub}", headers=_auth(ta), timeout=10)
        assert r.status_code == 200


# ────────────────── conversations router ──────────────────
class TestConversationsRouter:
    def test_send_get_delete_message(self):
        ta, ua = _new_user("cnvA")
        tb, ub = _new_user("cnvB")
        # send
        r = requests.post(f"{BASE_URL}/api/conversations/{ub}/messages",
                          headers=_auth(ta), json={"text": "hello from A"}, timeout=10)
        assert r.status_code == 200, r.text
        msg_id = r.json().get("message", {}).get("id") or r.json().get("id")
        # get
        r = requests.get(f"{BASE_URL}/api/conversations/{ub}/messages",
                         headers=_auth(ta), timeout=10)
        assert r.status_code == 200
        msgs = r.json().get("messages", [])
        assert any(m.get("text") == "hello from A" for m in msgs)
        # B sees it too
        r = requests.get(f"{BASE_URL}/api/conversations/{ua}/messages",
                         headers=_auth(tb), timeout=10)
        assert r.status_code == 200
        # list conversations
        r = requests.get(f"{BASE_URL}/api/conversations", headers=_auth(ta), timeout=10)
        assert r.status_code == 200
        # delete message for everyone
        if msg_id:
            r = requests.delete(
                f"{BASE_URL}/api/conversations/{ub}/messages/{msg_id}",
                params={"for_everyone": "true"},
                headers=_auth(ta), timeout=10,
            )
            assert r.status_code in (200, 204)

    def test_clear_conversation(self):
        ta, ua = _new_user("clrA")
        tb, ub = _new_user("clrB")
        requests.post(f"{BASE_URL}/api/conversations/{ub}/messages",
                      headers=_auth(ta), json={"text": "to be cleared"}, timeout=10)
        r = requests.delete(f"{BASE_URL}/api/conversations/{ub}",
                            params={"for_everyone": "true"},
                            headers=_auth(ta), timeout=10)
        assert r.status_code in (200, 204)
        r = requests.get(f"{BASE_URL}/api/conversations/{ub}/messages",
                         headers=_auth(ta), timeout=10)
        msgs = r.json().get("messages", [])
        assert msgs == [] or all(m.get("deleted") for m in msgs)


# ────────────────── admin router ──────────────────
class TestAdminRouter:
    def test_admin_users_requires_token(self):
        r = requests.get(f"{BASE_URL}/api/admin/users", timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_users_ok(self):
        r = requests.get(f"{BASE_URL}/api/admin/users",
                         headers={"x-admin-token": ADMIN_TOKEN}, timeout=10)
        assert r.status_code == 200

    def test_admin_reports_ok(self):
        r = requests.get(f"{BASE_URL}/api/admin/reports",
                         headers={"x-admin-token": ADMIN_TOKEN}, timeout=10)
        assert r.status_code == 200


# ────────────────── shared state (Socket.IO ⇄ REST) ──────────────────
class TestSharedState:
    def test_state_module_imports_clean(self):
        state = importlib.import_module("state")
        for attr in ("user_sessions", "user_rooms", "active_connections",
                     "waiting_queue", "sio"):
            assert hasattr(state, attr), f"state.py missing {attr}"

    def test_routers_and_server_import_same_state_objects(self):
        from state import user_sessions, active_connections
        from routers import auth as ra
        from routers import profile as rp
        import server as srv
        # identity check across modules
        assert ra.user_sessions is user_sessions
        assert rp.active_connections is active_connections
        assert srv.user_sessions is user_sessions

    def test_socketio_polling_endpoint_reachable(self):
        r = requests.get(f"{BASE_URL}/api/socket.io/?EIO=4&transport=polling", timeout=10)
        assert r.status_code == 200


# ────────────────── bot.py smoke import ──────────────────
class TestBotImport:
    def test_bot_module_imports(self):
        # Should not crash — confirms /start handler decorator wiring
        bot = importlib.import_module("bot")
        # The bot exposes either `run_bot` (async) or `application`
        assert hasattr(bot, "run_bot") or hasattr(bot, "application") or hasattr(bot, "main")
