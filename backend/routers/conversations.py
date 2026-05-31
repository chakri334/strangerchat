"""Persistent conversations (People-tab chats)."""
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request, Response

from db import users_collection, messages_collection, conv_id_for
from state import active_connections, sio
from helpers import resolve_session, public_user_brief

router = APIRouter()


def next_monday_utc() -> datetime:
    """Return the next Monday 00:00 UTC. All chats are wiped at this boundary."""
    now = datetime.now(timezone.utc)
    days_ahead = (7 - now.weekday()) % 7  # Monday = 0
    if days_ahead == 0:
        days_ahead = 7  # today is Monday → schedule next Monday
    target = (now + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)
    return target


@router.get("/api/conversations")
async def list_conversations(request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")

    me = session["user_id"]
    pipeline = [
        {"$match": {"participants": me, "deleted_for": {"$ne": me}}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$conv_id",
            "last_message": {"$first": "$$ROOT"},
            "unread_count": {
                "$sum": {"$cond": [
                    {"$and": [
                        {"$ne": ["$sender_id", me]},
                        {"$not": {"$in": [me, {"$ifNull": ["$read_by", []]}]}}
                    ]},
                    1, 0
                ]}
            },
        }},
        {"$sort": {"last_message.created_at": -1}},
        {"$limit": 100},
    ]
    raw = await messages_collection.aggregate(pipeline).to_list(length=100)
    items = []
    for r in raw:
        lm = r["last_message"]
        peer_id = next((p for p in lm["participants"] if p != me), None)
        peer = await public_user_brief(peer_id)
        if not peer:
            continue
        my_user = await users_collection.find_one({"user_id": me}, {"_id": 0, "hotlist": 1})
        items.append({
            "conv_id": r["_id"],
            "peer": peer,
            "pinned": peer_id in (my_user.get("hotlist") or []),
            "unread_count": r.get("unread_count", 0),
            "last_message": {
                "message_id": lm["message_id"],
                "text": lm.get("text", ""),
                "has_photo": bool(lm.get("photo_url") or lm.get("photo_data")),
                "sender_id": lm["sender_id"],
                "created_at": lm["created_at"].isoformat() if isinstance(lm.get("created_at"), datetime) else lm.get("created_at"),
                "deleted_for_everyone": lm.get("deleted_for_everyone", False),
            },
        })
    return {"ok": True, "conversations": items}


@router.get("/api/conversations/{peer_user_id}/messages")
async def get_messages(peer_user_id: str, request: Request, limit: int = 50, before: Optional[str] = None):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")

    me = session["user_id"]
    conv = conv_id_for(me, peer_user_id)
    q = {"conv_id": conv, "deleted_for": {"$ne": me}}
    if before:
        try:
            q["created_at"] = {"$lt": datetime.fromisoformat(before)}
        except Exception:
            pass

    cursor = messages_collection.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 200))
    items = await cursor.to_list(length=limit)
    await messages_collection.update_many(
        {"conv_id": conv, "sender_id": peer_user_id},
        {"$addToSet": {"read_by": me}},
    )
    items.reverse()
    for m in items:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
        if isinstance(m.get("expires_at"), datetime):
            m["expires_at"] = m["expires_at"].isoformat()
    return {"ok": True, "messages": items, "conv_id": conv}


@router.post("/api/conversations/{peer_user_id}/messages")
async def send_message(peer_user_id: str, request: Request):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")

    body = await request.json()
    text = (body.get("text") or "").strip()
    photo_data = body.get("photo")
    if not text and not photo_data:
        return Response(status_code=400, content='{"ok": false, "message": "Empty message"}', media_type="application/json")

    me = session["user_id"]
    peer_doc = await users_collection.find_one({"user_id": peer_user_id}, {"_id": 0, "blocked": 1, "hotlist": 1})
    if peer_doc is None:
        return Response(status_code=404, content='{"ok": false, "message": "User not found"}', media_type="application/json")
    if me in (peer_doc.get("blocked") or []):
        return Response(status_code=403, content='{"ok": false, "message": "Cannot message this user"}', media_type="application/json")

    my_doc = await users_collection.find_one({"user_id": me}, {"_id": 0, "blocked": 1, "hotlist": 1})
    if peer_user_id in ((my_doc or {}).get("blocked") or []):
        return Response(status_code=403, content='{"ok": false, "message": "Unblock to send messages"}', media_type="application/json")

    conv = conv_id_for(me, peer_user_id)
    now = datetime.now(timezone.utc)

    msg = {
        "message_id": f"msg_{secrets.token_hex(8)}",
        "conv_id": conv,
        "participants": sorted([me, peer_user_id]),
        "sender_id": me,
        "recipient_id": peer_user_id,
        "text": text[:2000],
        "photo_data": photo_data[:1_000_000] if isinstance(photo_data, str) else None,
        "created_at": now,
        "read_by": [me],
        "deleted_for": [],
        "deleted_for_everyone": False,
        "expires_at": next_monday_utc(),  # All chats wipe every Monday 00:00 UTC
    }
    await messages_collection.insert_one(msg)

    peer_sids = [sid for sid, u in active_connections.items() if u.get("user_id") == peer_user_id]
    payload = {
        "message_id": msg["message_id"], "conv_id": conv, "sender_id": me,
        "text": msg["text"], "photo_data": msg["photo_data"], "created_at": now.isoformat(),
    }
    for psid in peer_sids:
        await sio.emit("direct_message", payload, room=psid)

    return {"ok": True, "message": payload}


@router.delete("/api/conversations/{peer_user_id}/messages/{message_id}")
async def delete_message(peer_user_id: str, message_id: str, request: Request, for_everyone: bool = False):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")

    me = session["user_id"]
    conv = conv_id_for(me, peer_user_id)
    msg = await messages_collection.find_one({"message_id": message_id, "conv_id": conv}, {"_id": 0})
    if not msg:
        return Response(status_code=404, content='{"ok": false, "message": "Not found"}', media_type="application/json")

    if for_everyone:
        if msg["sender_id"] != me:
            return Response(status_code=403, content='{"ok": false, "message": "Only the sender can delete for everyone"}', media_type="application/json")
        await messages_collection.update_one(
            {"message_id": message_id},
            {"$set": {"deleted_for_everyone": True, "text": "", "photo_data": None}},
        )
        peer_sids = [sid for sid, u in active_connections.items() if u.get("user_id") == peer_user_id]
        for psid in peer_sids:
            await sio.emit("message_deleted", {"message_id": message_id, "conv_id": conv, "for_everyone": True}, room=psid)
    else:
        await messages_collection.update_one(
            {"message_id": message_id},
            {"$addToSet": {"deleted_for": me}},
        )
    return {"ok": True}


@router.delete("/api/conversations/{peer_user_id}")
async def delete_conversation(peer_user_id: str, request: Request, for_everyone: bool = False):
    session = await resolve_session(request)
    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Auth required"}', media_type="application/json")

    me = session["user_id"]
    conv = conv_id_for(me, peer_user_id)
    if for_everyone:
        await messages_collection.delete_many({"conv_id": conv})
        peer_sids = [sid for sid, u in active_connections.items() if u.get("user_id") == peer_user_id]
        for psid in peer_sids:
            await sio.emit("conversation_cleared", {"conv_id": conv, "by_user_id": me}, room=psid)
    else:
        await messages_collection.update_many(
            {"conv_id": conv},
            {"$addToSet": {"deleted_for": me}},
        )
    return {"ok": True}
