"""Backend tests for the StumbleChat refactor:
- Email OTP send/verify (+ rate limit + invalid email)
- Session cookie issuance (httpOnly, Secure, SameSite=None)
- /api/auth/me with cookie-only and Bearer-only
- Admin endpoints (users + reports) — auth gating
- /api/check-ip happy path
- Socket.IO smoke: register_user assigns emoji from secrets-based pool
"""
import os
import re
import time
import asyncio
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if 'REACT_APP_BACKEND_URL' in os.environ else None
if not BASE_URL:
    # Read from frontend .env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                break

ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', 'stumblechat_admin_2026')
EMOJI_POOL = {'😊', '😎', '🤗', '😺', '🦊', '🐼', '🦄', '🌟'}


def _email(prefix='otp'):
    # Lowercase: backend normalises to lowercase so we compare like-for-like.
    return f"test_{prefix}_{int(time.time()*1000)}@example.com"


# ── Email OTP ────────────────────────────────────────────────────────────────

class TestEmailOtp:
    def test_send_otp_invalid_email_returns_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/email/send-otp", json={'email': 'not-an-email'})
        assert r.status_code == 400, r.text
        assert r.json().get('ok') is False

    def test_send_otp_returns_dev_code(self):
        r = requests.post(f"{BASE_URL}/api/auth/email/send-otp",
                          json={'email': _email('send')},
                          headers={'x-admin-token': ADMIN_TOKEN})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        assert 'dev_code' in body
        assert re.fullmatch(r'\d{6}', body['dev_code'])

    def test_verify_otp_success_sets_cookie_and_returns_user(self):
        email = _email('verify')
        send = requests.post(f"{BASE_URL}/api/auth/email/send-otp", json={'email': email},
                             headers={'x-admin-token': ADMIN_TOKEN}).json()
        code = send['dev_code']

        r = requests.post(
            f"{BASE_URL}/api/auth/email/verify-otp",
            json={'email': email, 'code': code},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        user = body['user']
        assert user['email'] == email
        assert user['user_id'].startswith('user_')
        assert isinstance(user['session_token'], str) and len(user['session_token']) > 20

        # Cookie was set
        set_cookie = r.headers.get('set-cookie', '')
        assert 'session_token=' in set_cookie.lower()
        # httpOnly + Secure + SameSite=None (httpx/requests preserves case)
        assert 'httponly' in set_cookie.lower()
        assert 'secure' in set_cookie.lower()
        assert 'samesite=none' in set_cookie.lower()

    def test_verify_otp_wrong_code_400_then_429_after_5(self):
        email = _email('badcode')
        requests.post(f"{BASE_URL}/api/auth/email/send-otp", json={'email': email})

        for i in range(5):
            r = requests.post(
                f"{BASE_URL}/api/auth/email/verify-otp",
                json={'email': email, 'code': '000000'},
            )
            assert r.status_code == 400, f"attempt {i+1}: {r.status_code} {r.text}"
            assert 'Invalid code' in r.text

        # 6th attempt should be 429 (server deletes record when attempts >= 5)
        r = requests.post(
            f"{BASE_URL}/api/auth/email/verify-otp",
            json={'email': email, 'code': '000000'},
        )
        assert r.status_code == 429, r.text
        assert 'Too many attempts' in r.text


# ── /api/auth/me with cookie-only and Bearer-only ────────────────────────────

class TestAuthMe:
    def _login(self):
        email = _email('me')
        send = requests.post(f"{BASE_URL}/api/auth/email/send-otp", json={'email': email},
                             headers={'x-admin-token': ADMIN_TOKEN}).json()
        code = send['dev_code']
        s = requests.Session()
        r = s.post(
            f"{BASE_URL}/api/auth/email/verify-otp",
            json={'email': email, 'code': code},
        )
        assert r.status_code == 200, r.text
        return s, r.json()['user'], email

    def test_me_with_cookie_only(self):
        s, _user, email = self._login()
        # Use the session (cookie jar) with NO Authorization header
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        assert body['user']['email'] == email

    def test_me_with_bearer_only_no_cookie(self):
        _s, user, email = self._login()
        token = user['session_token']
        # Plain requests (no cookie jar) — header-only auth
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={'Authorization': f'Bearer {token}'},
        )
        assert r.status_code == 200, r.text
        assert r.json()['user']['email'] == email

    def test_me_without_anything_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# ── Admin endpoints ──────────────────────────────────────────────────────────

class TestAdmin:
    def test_admin_users_requires_token(self):
        r = requests.get(f"{BASE_URL}/api/admin/users")
        assert r.status_code == 401

    def test_admin_users_with_token(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={'x-admin-token': ADMIN_TOKEN},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        assert isinstance(body['users'], list)
        assert isinstance(body['total'], int)
        # _id should never leak
        for u in body['users']:
            assert '_id' not in u

    def test_admin_reports_with_token(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/reports",
            headers={'x-admin-token': ADMIN_TOKEN},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        assert isinstance(body['reports'], list)


# ── Misc ─────────────────────────────────────────────────────────────────────

class TestCheckIp:
    def test_check_ip_not_blocked(self):
        r = requests.get(f"{BASE_URL}/api/check-ip")
        assert r.status_code == 200
        assert r.json().get('blocked') is False


# ── Socket.IO smoke — secrets-based emoji ────────────────────────────────────

class TestSocketIoEmoji:
    def test_register_user_assigns_emoji_and_match(self):
        import socketio as sio_client

        async def run():
            c = sio_client.AsyncClient(reconnection=False)
            registered = asyncio.Event()
            received = {}

            @c.on('registered')
            async def _r(data):
                received['registered'] = data
                registered.set()

            await c.connect(BASE_URL, socketio_path='/api/socket.io', transports=['polling'])
            await c.emit('register_user', {'name': 'TEST_emoji', 'city': 'TESTCITY', 'age': '25', 'gender': 'Female'})
            try:
                await asyncio.wait_for(registered.wait(), timeout=5)
            finally:
                await c.disconnect()
            return received

        result = asyncio.run(run())
        assert result.get('registered', {}).get('success') is True

        # Now fetch active users for TESTCITY and assert the emoji is from secrets pool.
        # Note: by the time we hit /api/active-users, the socket has disconnected,
        # so we can't verify on-the-fly. Instead, do a paired test:
        async def run_two_and_match():
            import socketio as sio_client
            a = sio_client.AsyncClient(reconnection=False)
            b = sio_client.AsyncClient(reconnection=False)
            matched_a, matched_b = asyncio.Event(), asyncio.Event()
            partner_a, partner_b = {}, {}

            @a.on('match_found')
            async def _ma(d):
                partner_a.update(d.get('partner', {}))
                matched_a.set()

            @b.on('match_found')
            async def _mb(d):
                partner_b.update(d.get('partner', {}))
                matched_b.set()

            await a.connect(BASE_URL, socketio_path='/api/socket.io', transports=['polling'])
            await b.connect(BASE_URL, socketio_path='/api/socket.io', transports=['polling'])
            await a.emit('register_user', {'name': 'TEST_A', 'city': 'TESTCITY_PAIR'})
            await b.emit('register_user', {'name': 'TEST_B', 'city': 'TESTCITY_PAIR'})
            await asyncio.sleep(0.5)
            await a.emit('join_queue', {'city': 'TESTCITY_PAIR'})
            await b.emit('join_queue', {'city': 'TESTCITY_PAIR'})
            try:
                await asyncio.wait_for(asyncio.gather(matched_a.wait(), matched_b.wait()), timeout=8)
            finally:
                await a.disconnect()
                await b.disconnect()
            return partner_a, partner_b

        pa, pb = asyncio.run(run_two_and_match())
        assert pa.get('emoji') in EMOJI_POOL, f"Got {pa.get('emoji')}"
        assert pb.get('emoji') in EMOJI_POOL, f"Got {pb.get('emoji')}"
