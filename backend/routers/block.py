"""Block + Hotlist routes."""
from fastapi import APIRouter, Request, Response

from db import users_collection, messages_collection, conv_id_for
from state import active_connections
from helpers import resolve_session

from datetime import datetime, timezone, timedelta

router = APIRouter()


# ─── Block / Unblock ───────────────────────────────────────────────────────
@router.post("/api/block/{target_user_id}")
async def block_user(target_user_id: str, request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    if target_user_id == session["user_id"]:
        return Response(status_code=400, content='{"ok": false, "message": "Cannot block self"}', media_type="application/json")
    await users_collection.update_one(
        {"user_id": session["user_id"]}, {"$addToSet": {"blocked": target_user_id}},
    )
    return {"ok": True, "blocked": target_user_id}


@router.delete("/api/block/{target_user_id}")
async def unblock_user(target_user_id: str, request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    await users_collection.update_one(
        {"user_id": session["user_id"]}, {"$pull": {"blocked": target_user_id}},
    )
    return {"ok": True, "unblocked": target_user_id}


@router.get("/api/blocked")
async def list_blocked(request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    me = await users_collection.find_one({"user_id": session["user_id"]}, {"_id": 0, "blocked": 1})
    ids = (me or {}).get("blocked", []) or []
    if not ids:
        return {"ok": True, "users": []}
    cursor = users_collection.find(
        {"user_id": {"$in": ids}},
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "stumble_id": 1},
    )
    users = await cursor.to_list(length=200)
    return {"ok": True, "users": users}


# ─── Hotlist (pinned conversations) ────────────────────────────────────────
@router.get("/api/hotlist")
async def list_hotlist(request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    me = await users_collection.find_one({"user_id": session["user_id"]}, {"_id": 0, "hotlist": 1})
    ids = (me or {}).get("hotlist") or []
    if not ids:
        return {"ok": True, "users": []}
    cursor = users_collection.find(
        {"user_id": {"$in": ids}},
        {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "stumble_id": 1, "bio": 1},
    )
    users = await cursor.to_list(length=100)
    online_ids = {u.get("user_id") for u in active_connections.values() if u.get("user_id")}
    for u in users:
        u["online"] = u["user_id"] in online_ids
    return {"ok": True, "users": users}


@router.post("/api/hotlist/{target_user_id}")
async def hotlist_add(target_user_id: str, request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    await users_collection.update_one(
        {"user_id": session["user_id"]}, {"$addToSet": {"hotlist": target_user_id}},
    )
    conv = conv_id_for(session["user_id"], target_user_id)
    await messages_collection.update_many(
        {"conv_id": conv},
        {"$unset": {"expires_at": ""}, "$set": {"pinned": True}},
    )
    return {"ok": True, "pinned": target_user_id}


@router.delete("/api/hotlist/{target_user_id}")
async def hotlist_remove(target_user_id: str, request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")
    await users_collection.update_one(
        {"user_id": session["user_id"]}, {"$pull": {"hotlist": target_user_id}},
    )
    other = await users_collection.find_one({"user_id": target_user_id}, {"_id": 0, "hotlist": 1})
    other_pins = set((other or {}).get("hotlist") or [])
    if session["user_id"] not in other_pins:
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        conv = conv_id_for(session["user_id"], target_user_id)
        await messages_collection.update_many(
            {"conv_id": conv},
            {"$set": {"expires_at": expires_at, "pinned": False}},
        )
    return {"ok": True, "unpinned": target_user_id}
