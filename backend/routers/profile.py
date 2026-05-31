"""Profile routes — /api/profile/me, picture upload, gallery, /api/users/search, /api/active-users."""
import base64 as _b64
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, Response, UploadFile, File

from db import users_collection
from state import (
    user_sessions, users_db, active_connections,
    ALLOWED_PIC_TYPES, MAX_PIC_BYTES, MAX_GALLERY_IMAGES,
)
from helpers import resolve_session, haversine_km

router = APIRouter()

NEARBY_KM = 100  # within this radius → sort by distance; beyond → randomised


# ─── Profile CRUD ──────────────────────────────────────────────────────────
@router.get("/api/profile/me")
async def profile_me(request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Not authenticated"}', media_type="application/json")

    profile = await users_collection.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not profile:
        return Response(status_code=404, content='{"ok": false, "message": "Profile not found"}', media_type="application/json")

    profile.setdefault("bio", "")
    profile.setdefault("gender", "")
    profile.setdefault("interested_in", "")
    profile.setdefault("interests", [])
    profile.setdefault("images", [])
    profile.setdefault("hotlist", [])
    profile.setdefault("blocked", [])
    profile.setdefault("telegram_id", "")
    profile.setdefault("stumble_id", "")
    profile["gender_locked"] = (profile.get("provider") == "google" and bool(profile.get("gender")))
    return {"ok": True, "profile": profile}


@router.put("/api/profile/me")
async def profile_update(request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Not authenticated"}', media_type="application/json")

    body = await request.json()
    user_id = session["user_id"]
    current = await users_collection.find_one({"user_id": user_id}, {"_id": 0})
    is_google = (current or {}).get("provider") == "google"

    updates = {}
    if isinstance(body.get("name"), str):
        updates["name"] = body["name"].strip()[:60]
    if isinstance(body.get("bio"), str):
        updates["bio"] = body["bio"].strip()[:280]
    if body.get("gender") in ("male", "female", "other", ""):
        if not (is_google and current.get("gender")):
            updates["gender"] = body["gender"]
    if body.get("interested_in") in ("male", "female", "both", ""):
        updates["interested_in"] = body["interested_in"]
    if isinstance(body.get("interests"), list):
        seen, cleaned = set(), []
        for t in body["interests"]:
            tag = str(t).strip().lower()[:30]
            if tag and tag not in seen:
                seen.add(tag)
                cleaned.append(tag)
        updates["interests"] = cleaned[:10]
    if isinstance(body.get("images"), list):
        updates["images"] = [str(i) for i in body["images"] if isinstance(i, str)][:5]
    if isinstance(body.get("picture"), str):
        updates["picture"] = body["picture"]
    if isinstance(body.get("telegram_id"), str):
        updates["telegram_id"] = body["telegram_id"].strip()[:64]

    if not updates:
        return {"ok": True, "message": "No changes"}

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await users_collection.update_one({"user_id": user_id}, {"$set": updates})

    if user_id in users_db:
        users_db[user_id].update(updates)
    for sess in user_sessions.values():
        if sess.get("user_id") == user_id and "name" in updates:
            sess["name"] = updates["name"]

    profile = await users_collection.find_one({"user_id": user_id}, {"_id": 0})
    return {"ok": True, "profile": profile}


# ─── Profile picture ───────────────────────────────────────────────────────
@router.post("/api/profile/picture")
async def upload_profile_picture(request: Request, file: UploadFile = File(...)):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    if file.content_type not in ALLOWED_PIC_TYPES:
        return Response(status_code=400, content='{"ok": false, "message": "Only JPEG, PNG, WebP or GIF images are allowed"}', media_type="application/json")

    data = await file.read()
    if len(data) > MAX_PIC_BYTES:
        return Response(status_code=413, content='{"ok": false, "message": "File too large (max 2MB)"}', media_type="application/json")
    if len(data) == 0:
        return Response(status_code=400, content='{"ok": false, "message": "Empty file"}', media_type="application/json")

    data_url = f"data:{file.content_type};base64,{_b64.b64encode(data).decode('ascii')}"
    await users_collection.update_one(
        {"user_id": session["user_id"]},
        {"$set": {"picture": data_url, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "picture": data_url}


@router.delete("/api/profile/picture")
async def delete_profile_picture(request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    await users_collection.update_one({"user_id": session["user_id"]}, {"$set": {"picture": ""}})
    return {"ok": True}


# ─── Image gallery (max 5) ─────────────────────────────────────────────────
@router.post("/api/profile/images")
async def upload_gallery_image(request: Request, file: UploadFile = File(...)):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    if file.content_type not in ALLOWED_PIC_TYPES:
        return Response(status_code=400, content='{"ok": false, "message": "Only JPEG, PNG, WebP or GIF images are allowed"}', media_type="application/json")

    data = await file.read()
    if len(data) > MAX_PIC_BYTES:
        return Response(status_code=413, content='{"ok": false, "message": "File too large (max 2MB)"}', media_type="application/json")
    if len(data) == 0:
        return Response(status_code=400, content='{"ok": false, "message": "Empty file"}', media_type="application/json")

    user_id = session["user_id"]
    me = await users_collection.find_one({"user_id": user_id}, {"_id": 0, "images": 1})
    current = (me or {}).get("images") or []
    if len(current) >= MAX_GALLERY_IMAGES:
        return Response(status_code=400, content=f'{{"ok": false, "message": "Gallery full (max {MAX_GALLERY_IMAGES})"}}', media_type="application/json")

    data_url = f"data:{file.content_type};base64,{_b64.b64encode(data).decode('ascii')}"
    await users_collection.update_one({"user_id": user_id}, {"$push": {"images": data_url}})
    updated = await users_collection.find_one({"user_id": user_id}, {"_id": 0, "images": 1})
    return {"ok": True, "images": (updated or {}).get("images") or []}


@router.delete("/api/profile/images/{index}")
async def delete_gallery_image(index: int, request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    user_id = session["user_id"]
    me = await users_collection.find_one({"user_id": user_id}, {"_id": 0, "images": 1})
    current = list((me or {}).get("images") or [])
    if index < 0 or index >= len(current):
        return Response(status_code=400, content='{"ok": false, "message": "Index out of range"}', media_type="application/json")
    current.pop(index)
    await users_collection.update_one({"user_id": user_id}, {"$set": {"images": current}})
    return {"ok": True, "images": current}


# ─── Stumble ID search ─────────────────────────────────────────────────────
@router.get("/api/users/search")
async def users_search(request: Request, stumble_id: Optional[str] = None):
    if not stumble_id:
        return Response(status_code=400, content='{"ok": false, "message": "stumble_id required"}', media_type="application/json")
    sid_norm = stumble_id.strip().lower()
    if not sid_norm.startswith("@"):
        sid_norm = "@" + sid_norm

    found = await users_collection.find_one({"stumble_id": sid_norm}, {"_id": 0})
    if not found:
        return {"ok": True, "user": None, "online": False}

    online = any((u.get("user_id") == found["user_id"]) for u in active_connections.values())
    return {"ok": True, "user": {
        "user_id": found["user_id"], "name": found.get("name", ""),
        "picture": found.get("picture", ""), "bio": found.get("bio", ""),
        "gender": found.get("gender", ""), "interests": found.get("interests", []),
        "stumble_id": found.get("stumble_id", ""),
    }, "online": online}


# ─── Active users directory (filtered by gender + sorted by distance) ──────
@router.get("/api/active-users")
async def get_active_users(request: Request,
                           city: Optional[str] = None,
                           interests: Optional[str] = None,
                           lat: Optional[float] = None,
                           lng: Optional[float] = None,
                           gender_filter: Optional[str] = None):
    tag_filter = None
    if interests:
        tag_filter = {t.strip().lower() for t in interests.split(",") if t.strip()}

    session = await resolve_session(request)
    me = None
    me_blocked = set()
    me_interested_in = ""
    if session:
        me = await users_collection.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if me:
            me_blocked = set(me.get("blocked") or [])
            me_interested_in = me.get("interested_in") or ""

    if gender_filter in ("male", "female", "both", "other"):
        me_interested_in = gender_filter

    # Restrict directory to users signed in with Google (exclude Telegram + guests + email-OTP).
    candidate_uids = {
        u.get("user_id") for u in active_connections.values()
        if u.get("user_id") and not u.get("is_telegram")
    }
    google_uids = set()
    if candidate_uids:
        cursor = users_collection.find(
            {"user_id": {"$in": list(candidate_uids)}, "provider": "google"},
            {"_id": 0, "user_id": 1},
        )
        async for doc in cursor:
            google_uids.add(doc["user_id"])

    users = []
    for sid, user in active_connections.items():
        if me and user.get("user_id") == me.get("user_id"):
            continue
        if user.get("user_id") and user["user_id"] in me_blocked:
            continue
        # Guests, Telegram users, and non-Google accounts are hidden from People tab.
        if not user.get("user_id") or user.get("is_telegram") or user["user_id"] not in google_uids:
            continue

        user_city = user.get("city", "Global")
        if city and city != "Global" and user_city != city:
            continue

        user_tags = [t.lower() for t in (user.get("interests") or [])]
        if tag_filter and not (tag_filter & set(user_tags)):
            continue

        if me_interested_in in ("male", "female") and user.get("gender") != me_interested_in:
            continue

        entry = {
            "sid": sid, "name": user.get("name", "Anonymous"),
            "age": user.get("age", ""), "gender": user.get("gender", ""),
            "city": user_city, "emoji": user.get("emoji", "😊"),
            "picture": user.get("picture") or "",
            "interests": user.get("interests") or [],
            "interested_in": user.get("interested_in") or "",
            "bio": user.get("bio") or "",
            "user_id": user.get("user_id"),
            "stumble_id": user.get("stumble_id") or "",
        }
        if lat is not None and lng is not None and user.get("lat") is not None and user.get("lng") is not None:
            entry["distance_km"] = round(haversine_km(lat, lng, user["lat"], user["lng"]), 1)
        users.append(entry)

    if lat is not None and lng is not None:
        # Split: within 100 km → sort by distance ascending; beyond → randomised
        nearby = [u for u in users if u.get("distance_km") is not None and u["distance_km"] <= NEARBY_KM]
        far = [u for u in users if u.get("distance_km") is None or u["distance_km"] > NEARBY_KM]
        nearby.sort(key=lambda u: u["distance_km"])
        # Cryptographically random shuffle for the "far" bucket
        for i in range(len(far) - 1, 0, -1):
            j = secrets.randbelow(i + 1)
            far[i], far[j] = far[j], far[i]
        users = nearby + far

    return {"users": users, "count": len(users)}
