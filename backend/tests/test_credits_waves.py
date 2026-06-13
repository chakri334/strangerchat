"""
Tests for the Wave + Credits + DM-Unlock system as built.

Endpoints under test:
  GET  /api/credits/balance           → {ok, balance, total_earned}
  POST /api/credits/claim-daily       → +5 credits, blocked within 24h
  POST /api/credits/claim-ad-reward   → +10 credits per call
  POST /api/credits/claim-profile-bonus → +20 (one-time, requires profile fields)
  POST /api/credits/unlock-dm         → -30 credits, creates dm_status record
  GET  /api/credits/dm-status/{pid}   → {unlocked, expires_at?}
  POST /api/waves/send                → 'pending' first, 'matched' on mutual
"""
import os
import sys
import uuid
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "stumblechat_admin_2026")

_AUTH_HDR = {"x-admin-token": ADMIN_TOKEN}


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _new_user(label="cred"):
    email = f"TEST_{label}_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/email/send-otp",
                      json={"email": email, "name": f"TEST {label}"},
                      headers=_AUTH_HDR, timeout=10)
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    r2 = requests.post(f"{BASE_URL}/api/auth/email/verify-otp",
                       json={"email": email, "code": code, "name": f"TEST {label}"}, timeout=10)
    assert r2.status_code == 200, r2.text
    u = r2.json()["user"]
    return u["session_token"], u["user_id"]


# ── Credits ─────────────────────────────────────────────────────────────────
class TestCreditsBalance:
    def test_default_balance_is_zero(self):
        t, _ = _new_user("bal")
        r = requests.get(f"{BASE_URL}/api/credits/balance", headers=_auth(t), timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["ok"] is True
        assert b["balance"] == 0
        assert b["total_earned"] == 0


class TestClaimAdReward:
    def test_claim_grants_credits(self):
        t, _ = _new_user("adA")
        r = requests.post(f"{BASE_URL}/api/credits/claim-ad-reward", headers=_auth(t), timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["ok"] is True
        assert b["awarded"] > 0
        assert b["balance"] == b["awarded"]


class TestClaimDaily:
    def test_grants_then_blocks_within_24h(self):
        t, _ = _new_user("daily")
        r = requests.post(f"{BASE_URL}/api/credits/claim-daily", headers=_auth(t), timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["awarded"] > 0
        # Second claim is rejected (not 429 here, but ok=False with cooldown msg)
        r2 = requests.post(f"{BASE_URL}/api/credits/claim-daily", headers=_auth(t), timeout=10)
        assert r2.status_code == 200
        assert r2.json()["ok"] is False


class TestUnlockDm:
    def test_insufficient_credits_is_rejected(self):
        ta, _ = _new_user("uA")
        _, ub_id = _new_user("uB")
        r = requests.post(f"{BASE_URL}/api/credits/unlock-dm",
                          headers=_auth(ta),
                          json={"target_user_id": ub_id, "wave_id": "test"}, timeout=10)
        # Could be 400/402 with ok=False or 200 with ok=False — accept either
        body = r.json()
        assert body.get("ok") is False, body

    def test_unlock_with_enough_credits(self):
        ta, _ = _new_user("uC")
        _, ub_id = _new_user("uD")
        # Earn 30+ credits (3 ad claims)
        for _ in range(3):
            requests.post(f"{BASE_URL}/api/credits/claim-ad-reward", headers=_auth(ta), timeout=10)
        r = requests.post(f"{BASE_URL}/api/credits/unlock-dm",
                          headers=_auth(ta),
                          json={"target_user_id": ub_id, "wave_id": "test"}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True, body
        # dm-status confirms
        r2 = requests.get(f"{BASE_URL}/api/credits/dm-status/{ub_id}", headers=_auth(ta), timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("unlocked") is True


# ── Waves ───────────────────────────────────────────────────────────────────
class TestWaves:
    def test_pending_then_matched(self):
        ta, ua = _new_user("wA")
        tb, ub = _new_user("wB")
        # A → B
        r = requests.post(f"{BASE_URL}/api/waves/send",
                          headers=_auth(ta),
                          json={"to_user_id": ub}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["status"] == "pending"
        # B → A : mutual
        r2 = requests.post(f"{BASE_URL}/api/waves/send",
                           headers=_auth(tb),
                           json={"to_user_id": ua}, timeout=10)
        assert r2.status_code == 200, r2.text
        body2 = r2.json()
        assert body2["ok"] is True
        assert body2["status"] == "matched"
