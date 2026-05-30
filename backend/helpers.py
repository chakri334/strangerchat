"""
Cross-cutting helpers used by routers — auth, session, validation, geo, admin.
"""
import re
import math
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from fastapi import Request, Response

from db import users_collection, sessions_collection
from state import (
    user_sessions, users_db, active_connections,
    google_auth_states, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
    ADMIN_TOKEN, ALLOWED_ORIGINS,
)

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ─── Auth admin ────────────────────────────────────────────────────────────
def require_admin(request: Request) -> bool:
    if not ADMIN_TOKEN:
        return False
    provided = request.headers.get("x-admin-token") or request.query_params.get("token")
    return provided == ADMIN_TOKEN


# ─── Session resolution ────────────────────────────────────────────────────
async def resolve_session(request: Request) -> Optional[dict]:
    """Resolve current session from cookie or Bearer token. Falls back to MongoDB."""
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None

    session = user_sessions.get(token)
    if session:
        return session

    db_session = await sessions_collection.find_one({"session_token": token}, {"_id": 0})
    if not db_session:
        return None
    expires_at_val = db_session.get("expires_at")
    expires_iso = expires_at_val.isoformat() if isinstance(expires_at_val, datetime) else expires_at_val
    cached = {
        "user_id": db_session["user_id"],
        "email": db_session.get("email"),
        "name": db_session.get("name", ""),
        "picture": db_session.get("picture", ""),
        "expires_at": expires_iso,
    }
    user_sessions[token] = cached
    return cached


async def issue_session(user_id: str, email: str, name: str, picture: str) -> str:
    """Create, persist, cache and return a fresh session token."""
    session_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await sessions_collection.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })
    user_sessions[session_token] = {
        "user_id": user_id, "email": email, "name": name, "picture": picture,
        "expires_at": expires_at.isoformat(),
    }
    return session_token


def set_session_cookie(response: Response, session_token: str) -> None:
    response.set_cookie(
        key="session_token", value=session_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True, secure=True, samesite="none", path="/",
    )


# ─── Stumble ID & OTP ──────────────────────────────────────────────────────
async def generate_unique_stumble_id(seed: str) -> str:
    base = "".join(c for c in (seed or "").lower() if c.isalnum())[:12] or "user"
    for _ in range(10):
        candidate = f"@{base}{secrets.randbelow(9000) + 1000}"
        if not await users_collection.find_one({"stumble_id": candidate}, {"_id": 0}):
            return candidate
    return f"@{base}{secrets.token_hex(3)}"


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


# ─── OAuth helpers ─────────────────────────────────────────────────────────
def resolve_trusted_origin(request: Request) -> str:
    referer = request.headers.get("referer", "")
    origin = request.headers.get("origin", "")
    for allowed in ALLOWED_ORIGINS:
        if allowed in referer or allowed in origin:
            return allowed
    return "https://stumblechat.online"


def resolve_redirect_uri(request: Request) -> str:
    from state import GOOGLE_REDIRECT_URI as _R
    if _R:
        return _R
    host = request.headers.get("host", "")
    scheme = request.headers.get("x-forwarded-proto", "https")
    return f"{scheme}://{host}/api/auth/google/callback"


def oauth_popup_error(message: str, frontend_origin: str) -> Response:
    safe_msg = (message or "").replace("'", "\\'").replace("\n", " ")
    html = (
        f"<html><body><script>"
        f"window.opener && window.opener.postMessage("
        f"{{type:'google-auth-error', message:'{safe_msg}'}}, '{frontend_origin}');"
        f"window.close();</script></body></html>"
    )
    return Response(content=html, media_type="text/html")


def oauth_popup_success(*, user_id: str, email: str, name: str, picture: str,
                        session_token: str, frontend_origin: str) -> Response:
    import json as _json
    user_data = {"user_id": user_id, "email": email, "name": name,
                 "picture": picture, "session_token": session_token}
    user_json = _json.dumps(user_data)
    html = (
        f"<html><body><script>"
        f"window.opener && window.opener.postMessage("
        f"{{type:'google-auth-success', user:{user_json}}}, '{frontend_origin}');"
        f"window.close();</script></body></html>"
    )
    resp = Response(content=html, media_type="text/html")
    set_session_cookie(resp, session_token)
    return resp


def exchange_code_for_profile(code: str, redirect_uri: str) -> dict:
    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code, "client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri, "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if token_response.status_code != 200:
        logger.error(f"Token exchange failed: {token_response.text}")
        raise RuntimeError("Token exchange failed")

    access_token = token_response.json().get("access_token")
    if not access_token:
        raise RuntimeError("No access token received")

    profile_response = requests.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if profile_response.status_code != 200:
        raise RuntimeError("Failed to get user profile")
    profile = profile_response.json()
    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise RuntimeError("No email in profile")
    return {"email": email, "name": profile.get("name", ""), "picture": profile.get("picture", "")}


# ─── User upserts ──────────────────────────────────────────────────────────
async def upsert_user_from_google(profile: dict) -> str:
    email = profile["email"]
    name = profile["name"]
    picture = profile.get("picture", "")
    existing = await users_collection.find_one({"email": email}, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()

    if existing:
        user_id = existing["user_id"]
        await users_collection.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture, "last_login_at": now_iso, "provider": "google"}},
        )
        logger.info(f"Existing user logged in: {email}")
    else:
        user_id = f"user_{secrets.token_hex(6)}"
        stumble_id = await generate_unique_stumble_id(name or email.split("@")[0])
        await users_collection.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "provider": "google", "stumble_id": stumble_id, "gender": "", "interested_in": "",
            "interests": [], "bio": "", "images": [], "hotlist": [], "blocked": [],
            "telegram_id": "", "created_at": now_iso, "last_login_at": now_iso,
        })
        logger.info(f"New StumbleChat user created (google): {email}")

    users_db[user_id] = {
        "user_id": user_id, "email": email, "name": name, "picture": picture,
        "provider": "google", "created_at": now_iso,
    }
    return user_id


async def upsert_email_user(email: str, name: str) -> str:
    existing = await users_collection.find_one({"email": email}, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing:
        user_id = existing["user_id"]
        await users_collection.update_one(
            {"email": email},
            {"$set": {"name": name, "last_login_at": now_iso, "provider": existing.get("provider", "email")}},
        )
    else:
        user_id = f"user_{secrets.token_hex(6)}"
        stumble_id = await generate_unique_stumble_id(name or email.split("@")[0])
        await users_collection.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": "",
            "provider": "email", "stumble_id": stumble_id, "gender": "", "interested_in": "",
            "interests": [], "bio": "", "images": [], "hotlist": [], "blocked": [],
            "telegram_id": "", "created_at": now_iso, "last_login_at": now_iso,
        })
        logger.info(f"New StumbleChat user created (email): {email}")

    users_db[user_id] = {
        "user_id": user_id, "email": email, "name": name, "picture": "",
        "provider": "email", "created_at": now_iso,
    }
    return user_id


# ─── Generic helpers ───────────────────────────────────────────────────────
async def public_user_brief(user_id: Optional[str]) -> Optional[dict]:
    if not user_id:
        return None
    u = await users_collection.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        return None
    return {
        "user_id": u["user_id"], "name": u.get("name", ""),
        "picture": u.get("picture", ""), "stumble_id": u.get("stumble_id", ""),
    }


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))
