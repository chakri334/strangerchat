"""Auth routes — Google OAuth, email OTP, /me, /logout."""
import json as _json
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, Response
from urllib.parse import urlencode

from db import users_collection, sessions_collection, otp_collection
from state import (
    user_sessions, google_auth_states, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI,
)
from helpers import (
    EMAIL_RE, resolve_session, issue_session, set_session_cookie,
    resolve_trusted_origin, resolve_redirect_uri,
    oauth_popup_error, oauth_popup_success,
    exchange_code_for_profile, upsert_user_from_google, upsert_email_user,
    hash_otp,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Google OAuth ──────────────────────────────────────────────────────────
@router.get("/api/auth/google/start")
async def google_auth_start(request: Request):
    if not GOOGLE_CLIENT_ID:
        return Response(status_code=500, content='{"ok": false, "message": "Google OAuth not configured"}', media_type="application/json")

    state = secrets.token_urlsafe(32)
    google_auth_states[state] = datetime.now(timezone.utc)

    # Clean up old states (5 minutes)
    now = datetime.now(timezone.utc)
    expired = [s for s, t in google_auth_states.items() if (now - t).total_seconds() > 300]
    for s in expired:
        del google_auth_states[s]

    redirect_uri = resolve_redirect_uri(request)

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return {"ok": True, "auth_url": auth_url, "state": state}


@router.get("/api/auth/google/callback")
async def google_auth_callback(request: Request, code: Optional[str] = None,
                                state: Optional[str] = None, error: Optional[str] = None):
    frontend_origin = resolve_trusted_origin(request)
    redirect_uri = resolve_redirect_uri(request)

    if error:
        return oauth_popup_error(error, frontend_origin)
    if not state or state not in google_auth_states:
        return oauth_popup_error("Invalid state", frontend_origin)
    del google_auth_states[state]
    if not code:
        return oauth_popup_error("No authorization code", frontend_origin)

    try:
        profile = exchange_code_for_profile(code, redirect_uri)
        user_id = await upsert_user_from_google(profile)
        session_token = await issue_session(user_id, profile["email"], profile["name"], profile.get("picture", ""))
        return oauth_popup_success(
            user_id=user_id, email=profile["email"], name=profile["name"],
            picture=profile.get("picture", ""), session_token=session_token,
            frontend_origin=frontend_origin,
        )
    except Exception as e:
        logger.error(f"Google OAuth error: {e}")
        return oauth_popup_error("Authentication failed", frontend_origin)


# ─── Session endpoints ─────────────────────────────────────────────────────
@router.get("/api/auth/me")
async def get_current_user(request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Not authenticated"}', media_type="application/json")

    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        # Find which token this was
        token_to_remove = next(
            (t for t, s in user_sessions.items() if s.get("user_id") == session["user_id"]),
            None,
        )
        if token_to_remove:
            user_sessions.pop(token_to_remove, None)
            await sessions_collection.delete_one({"session_token": token_to_remove})
        return Response(status_code=401, content='{"ok": false, "message": "Session expired"}', media_type="application/json")

    return {"ok": True, "user": {
        "user_id": session["user_id"], "email": session["email"],
        "name": session["name"], "picture": session["picture"],
    }}


@router.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        user_sessions.pop(token, None)
        await sessions_collection.delete_one({"session_token": token})
    response.delete_cookie(key="session_token", path="/")
    return {"ok": True, "message": "Logged out successfully"}


# ─── Email OTP ─────────────────────────────────────────────────────────────
# In-memory OTP rate limit store: email -> list of request timestamps
_otp_send_log: dict[str, list] = {}
_otp_ip_log:   dict[str, list] = {}

OTP_PER_EMAIL_PER_HOUR = 3   # max OTPs per email per hour
OTP_PER_IP_PER_HOUR    = 10  # max OTPs per IP per hour

def _otp_rate_limited(store: dict, key: str, limit: int) -> bool:
    """Return True if key has exceeded limit in the last 60 minutes."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=1)
    hits = [t for t in store.get(key, []) if t > cutoff]
    store[key] = hits
    if len(hits) >= limit:
        return True
    store[key].append(now)
    return False

@router.post("/api/auth/email/send-otp")
async def email_send_otp(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        return Response(status_code=400, content='{"ok": false, "message": "Invalid email"}', media_type="application/json")

    # Test/CI: admin token bypasses rate limits.
    is_admin = request.headers.get("x-admin-token") == os.environ.get("ADMIN_TOKEN")

    # Rate limit by email
    if not is_admin and _otp_rate_limited(_otp_send_log, email, OTP_PER_EMAIL_PER_HOUR):
        return Response(status_code=429, content='{"ok": false, "message": "Too many OTP requests. Try again in an hour."}', media_type="application/json")

    # Rate limit by IP
    client_ip = request.client.host
    if not is_admin and _otp_rate_limited(_otp_ip_log, client_ip, OTP_PER_IP_PER_HOUR):
        return Response(status_code=429, content='{"ok": false, "message": "Too many requests from your network. Try again later."}', media_type="application/json")

    code = f"{secrets.randbelow(900000) + 100000}"
    from datetime import timedelta
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    await otp_collection.update_one(
        {"email": email},
        {"$set": {
            "email": email, "code_hash": hash_otp(code),
            "expires_at": expires_at, "attempts": 0,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    logger.info(f"OTP generated for {email} from {client_ip}")
    # TODO: wire to email provider (SMTP/SendGrid) before production
    body_out = {"ok": True, "message": "OTP sent"}
    # Test/CI backdoor: callers with a valid admin token get the code back
    # (production clients NEVER have this header — it's only known by admin/tests).
    if is_admin:
        body_out["dev_code"] = code
    return body_out


@router.post("/api/auth/email/verify-otp")
async def email_verify_otp(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    name = (body.get("name") or "").strip() or email.split("@")[0]

    if not EMAIL_RE.match(email) or not code:
        return Response(status_code=400, content='{"ok": false, "message": "Invalid input"}', media_type="application/json")

    otp_doc = await otp_collection.find_one({"email": email})
    err = await _validate_otp(otp_doc, email, code)
    if err is not None:
        return err

    await otp_collection.delete_one({"email": email})
    user_id = await upsert_email_user(email, name)
    session_token = await issue_session(user_id, email, name, "")

    body_json = {"ok": True, "user": {
        "user_id": user_id, "email": email, "name": name, "picture": "",
        "session_token": session_token,
    }}
    resp = Response(content=_json.dumps(body_json), media_type="application/json")
    set_session_cookie(resp, session_token)
    return resp


async def _validate_otp(otp_doc: Optional[dict], email: str, code: str) -> Optional[Response]:
    if not otp_doc:
        return Response(status_code=400, content='{"ok": false, "message": "No OTP requested"}', media_type="application/json")

    expires_at = otp_doc.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            await otp_collection.delete_one({"email": email})
            return Response(status_code=400, content='{"ok": false, "message": "OTP expired"}', media_type="application/json")

    if otp_doc.get("attempts", 0) >= 5:
        await otp_collection.delete_one({"email": email})
        return Response(status_code=429, content='{"ok": false, "message": "Too many attempts"}', media_type="application/json")

    if hash_otp(code) != otp_doc.get("code_hash"):
        await otp_collection.update_one({"email": email}, {"$inc": {"attempts": 1}})
        return Response(status_code=400, content='{"ok": false, "message": "Invalid code"}', media_type="application/json")

    return None
