"""Stumble Chat — slim FastAPI + Socket.IO server.

Module structure:
    state.py     — shared in-memory state, config, the Socket.IO instance
    db.py        — MongoDB collections + indexes + conv_id helper
    helpers.py   — auth/session/OAuth/profile helpers
    routers/
      auth.py            — /api/auth/*
      profile.py         — /api/profile/*, /api/users/search, /api/active-users
      conversations.py   — /api/conversations/*
      block.py           — /api/block/*, /api/hotlist/*, /api/blocked
      admin.py           — /api/admin/*, /api/check-ip, /api/stats

This file owns: FastAPI app, CORS, lifespan, Socket.IO event handlers,
and the root / health endpoints.
"""
import os
import asyncio
import logging
import uuid
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path

from db import users_collection, reports_collection, sessions_collection, messages_collection, init_indexes
from state import (
    sio, ALLOWED_ORIGINS,
    active_connections, waiting_queue, city_users, active_chats, user_rooms,
    photo_messages, reports, ip_blocks, ip_report_count, user_ip_map,
    user_sessions, users_db,
)
from helpers import generate_unique_stumble_id
from routers.conversations import next_monday_utc

# Routers
from routers.auth import router as auth_router
from routers.profile import router as profile_router
from routers.conversations import router as conversations_router
from routers.block import router as block_router
from routers.admin import router as admin_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app_instance):
    # MongoDB indexes
    try:
        await init_indexes()
        logger.info("MongoDB indexes initialized")
    except Exception as e:
        logger.error(f"Failed to initialize MongoDB indexes: {e}")

    # Backfill — ensure all users have stumble_id + default arrays
    try:
        async for u in users_collection.find(
            {"$or": [{"stumble_id": {"$exists": False}}, {"stumble_id": ""}]},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1},
        ):
            new_id = await generate_unique_stumble_id(u.get("name") or (u.get("email") or "").split("@")[0])
            await users_collection.update_one(
                {"user_id": u["user_id"]},
                {"$set": {
                    "stumble_id": new_id, "hotlist": [], "blocked": [], "telegram_id": "",
                }},
            )
        logger.info("User backfill complete (stumble_id, hotlist, blocked, telegram_id)")
    except Exception as e:
        logger.error(f"User backfill failed: {e}")

    # Backfill — every message gets `expires_at = next Monday`. This sweeps up
    # legacy pinned-hotlist messages so they obey the new weekly Monday purge.
    try:
        backfill_result = await messages_collection.update_many(
            {"expires_at": {"$exists": False}},
            {"$set": {"expires_at": next_monday_utc()}, "$unset": {"pinned": ""}},
        )
        if backfill_result.modified_count:
            logger.info(f"Message TTL backfill: {backfill_result.modified_count} legacy messages set to expire next Monday")
    except Exception as e:
        logger.error(f"Message TTL backfill failed: {e}")

    # Telegram bot (optional)
    bot_task = None
    telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if telegram_token:
        try:
            from bot import run_bot
            bot_task = asyncio.create_task(run_bot())
            logger.info("Telegram bot started successfully")
        except Exception as e:
            logger.error(f"Failed to start Telegram bot: {e}")

    yield

    # Shutdown
    if bot_task:
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass


# ─── FastAPI app ───────────────────────────────────────────────────────────
app = FastAPI(title="Stumble Chat API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth_router, tags=["auth"])
app.include_router(profile_router, tags=["profile"])
app.include_router(conversations_router, tags=["conversations"])
app.include_router(block_router, tags=["block"])
app.include_router(admin_router, tags=["admin"])


# ─── Root + health ─────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {
        "status": "healthy", "service": "chat-server",
        "online_users": len(active_connections), "active_chats": len(active_chats),
    }


@app.get("/api/")
async def api_root():
    return {"message": "Stumble Chat API", "version": "2.0.0"}


# ═══════════════════════════════════════════════════════════════════════════
# Socket.IO event handlers
# ═══════════════════════════════════════════════════════════════════════════

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")
    client_ip = environ.get("HTTP_X_FORWARDED_FOR", environ.get("REMOTE_ADDR", "unknown"))
    if "," in str(client_ip):
        client_ip = client_ip.split(",")[0].strip()
    user_ip_map[sid] = client_ip

    now = datetime.now(timezone.utc)
    if client_ip in ip_blocks and ip_blocks[client_ip] > now:
        await sio.emit("blocked", {"message": "You are temporarily blocked due to reports."}, room=sid)
        await sio.disconnect(sid)
        return False
    await broadcast_stats()


@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")
    if sid in active_connections:
        user_data = active_connections[sid]
        city = user_data.get("city", "Unknown")
        if city in city_users:
            city_users[city] = max(0, city_users[city] - 1)
            if city_users[city] == 0:
                del city_users[city]
        if city in waiting_queue and sid in waiting_queue[city]:
            waiting_queue[city].remove(sid)
            if not waiting_queue[city]:
                del waiting_queue[city]
        if sid in user_rooms:
            room_id = user_rooms[sid]
            if room_id in active_chats:
                partner_sid = [s for s in active_chats[room_id] if s != sid]
                if partner_sid:
                    await sio.emit("partner_disconnected", room=partner_sid[0])
                del active_chats[room_id]
            del user_rooms[sid]
        del active_connections[sid]
    user_ip_map.pop(sid, None)
    await broadcast_stats()


@sio.on("register_user")
async def handle_register_user(sid, data):
    name = data.get("name", "Anonymous")
    age = data.get("age", "")
    gender = data.get("gender", "")
    city = data.get("city", "Global")
    session_token = data.get("session_token")

    auth_user = None
    if session_token:
        auth_user = user_sessions.get(session_token)
        if not auth_user:
            try:
                db_session = await sessions_collection.find_one({"session_token": session_token}, {"_id": 0})
                if db_session:
                    auth_user = {
                        "user_id": db_session["user_id"], "email": db_session.get("email"),
                        "name": db_session.get("name"), "picture": db_session.get("picture"),
                    }
            except Exception as e:
                logger.error(f"Failed to resolve session for socket: {e}")

    if sid in active_connections:
        old_city = active_connections[sid].get("city", "Global")
        if old_city in city_users:
            city_users[old_city] = max(0, city_users[old_city] - 1)
            if city_users[old_city] == 0:
                del city_users[old_city]

    active_connections[sid] = {
        "name": name, "age": age, "gender": gender, "city": city,
        "emoji": secrets.choice(["😊", "😎", "🤗", "😺", "🦊", "🐼", "🦄", "🌟"]),
        "user_id": (auth_user or {}).get("user_id"),
        "email": (auth_user or {}).get("email"),
        "picture": (auth_user or {}).get("picture"),
        "stumble_id": (auth_user or {}).get("stumble_id") or "",
        "interests": data.get("interests", []) or [],
        "interested_in": data.get("interested_in", ""),
        "bio": data.get("bio", ""),
        "lat": data.get("lat"), "lng": data.get("lng"),
    }
    city_users[city] = city_users.get(city, 0) + 1
    await sio.emit("registered", {"success": True}, room=sid)
    await broadcast_stats()


@sio.on("join_queue")
async def handle_join_queue(sid, data):
    city = data.get("city", "Unknown")
    target_sid = data.get("target_sid")
    if sid not in active_connections:
        await sio.emit("error", {"message": "Please register first"}, room=sid)
        return
    if sid in user_rooms:
        return
    if target_sid and target_sid in active_connections and target_sid != sid and target_sid not in user_rooms:
        await create_match(sid, target_sid)
        return
    active_connections[sid]["city"] = city
    for queue_city, users in list(waiting_queue.items()):
        if sid in users:
            users.remove(sid)
            if not users:
                del waiting_queue[queue_city]
    if city not in waiting_queue:
        waiting_queue[city] = []
    waiting_queue[city].append(sid)
    await try_match(city)
    asyncio.create_task(try_global_match_after_delay(sid, 5))


@sio.on("send_message")
async def handle_send_message(sid, data):
    if sid not in user_rooms:
        await sio.emit("error", {"message": "Not in a chat room"}, room=sid)
        return
    room_id = user_rooms[sid]
    message = data.get("message", "")
    timestamp = datetime.now(timezone.utc).isoformat()
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            await sio.emit("new_message", {"message": message, "timestamp": timestamp, "from": "partner"}, room=partner_sid[0])
        else:
            await sio.emit("error", {"message": "Partner not found"}, room=sid)
    else:
        await sio.emit("error", {"message": "Chat room expired"}, room=sid)


@sio.on("send_photo")
async def handle_send_photo(sid, data):
    if sid not in user_rooms:
        return
    room_id = user_rooms[sid]
    photo_data = data.get("photo", "")
    if not photo_data:
        return
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            photo_id = str(uuid.uuid4())
            # Relay immediately — do NOT store base64 in memory
            await sio.emit("photo_sent", {"photo": photo_data, "photo_id": photo_id}, room=sid)
            await sio.emit("new_photo", {"photo": photo_data, "photo_id": photo_id}, room=partner_sid[0])
            # Store only metadata for timer/delete tracking
            photo_messages[photo_id] = {
                "sender_sid": sid, "receiver_sid": partner_sid[0], "room_id": room_id,
                "opened": False, "timer_started": False,
                "created_at": datetime.now(timezone.utc),
            }


@sio.on("photo_opened")
async def handle_photo_opened(sid, data):
    photo_id = data.get("photo_id")
    if photo_id not in photo_messages:
        return
    photo_info = photo_messages[photo_id]
    if not photo_info["timer_started"]:
        photo_info["opened"] = True
        photo_info["timer_started"] = True
        sender_sid = photo_info["sender_sid"]
        receiver_sid = photo_info["receiver_sid"]
        await sio.emit("photo_timer_started", {"photo_id": photo_id, "duration": 15}, room=sender_sid)
        await sio.emit("photo_timer_started", {"photo_id": photo_id, "duration": 15}, room=receiver_sid)
        asyncio.create_task(delete_photo_after_delay(photo_id, 15))


@sio.on("skip_chat")
async def handle_skip_chat(sid, data):
    if sid in user_rooms:
        room_id = user_rooms[sid]
        if room_id in active_chats:
            partner_sid = [s for s in active_chats[room_id] if s != sid]
            if partner_sid:
                await sio.emit("partner_disconnected", room=partner_sid[0])
            if partner_sid and partner_sid[0] in user_rooms:
                del user_rooms[partner_sid[0]]
            del active_chats[room_id]
        del user_rooms[sid]
    await sio.emit("chat_ended", room=sid)
    if sid in active_connections:
        city = active_connections[sid]["city"]
        await handle_join_queue(sid, {"city": city})


@sio.on("disconnect_chat")
async def handle_disconnect_chat(sid, data=None):
    notify = data.get("notify", True) if data else True
    if sid in user_rooms:
        room_id = user_rooms[sid]
        if room_id in active_chats:
            partner_sid = [s for s in active_chats[room_id] if s != sid]
            if notify and partner_sid:
                await sio.emit("partner_disconnected", room=partner_sid[0])
            if partner_sid and partner_sid[0] in user_rooms:
                del user_rooms[partner_sid[0]]
            del active_chats[room_id]
        del user_rooms[sid]
    await sio.emit("chat_ended", room=sid)


@sio.on("leave_queue")
async def handle_leave_queue(sid, data=None):
    for city, users in list(waiting_queue.items()):
        if sid in users:
            users.remove(sid)
            if not users:
                del waiting_queue[city]
    await sio.emit("queue_left", {}, room=sid)


@sio.on("get_random_topic")
async def handle_get_random_topic(sid, data):
    topics = [
        "What's your favorite movie?",
        "If you could travel anywhere, where would it be?",
        "What's the best thing that happened to you this week?",
        "Do you have any hidden talents?",
        "What's your favorite food?",
        "If you could have dinner with anyone, who would it be?",
        "What's your dream job?",
        "What's the most adventurous thing you've done?",
        "Are you a morning person or night owl?",
        "What's your favorite way to spend a weekend?",
    ]
    await sio.emit("random_topic", {"topic": secrets.choice(topics)}, room=sid)


@sio.on("report_user")
async def handle_report_user(sid, data):
    if sid not in user_rooms:
        return
    room_id = user_rooms[sid]
    comment = data.get("comment", "")
    chat_history = data.get("chat_history", [])
    if room_id not in active_chats:
        return
    partner_sid = [s for s in active_chats[room_id] if s != sid]
    if not partner_sid:
        return

    reported_sid = partner_sid[0]
    reported_ip = user_ip_map.get(reported_sid, "unknown")
    reporter_ip = user_ip_map.get(sid, "unknown")
    reporter_user = active_connections.get(sid, {}) or {}
    reported_user = active_connections.get(reported_sid, {}) or {}

    report = {
        "id": str(uuid.uuid4()),
        "reported_sid": reported_sid, "reported_ip": reported_ip,
        "reported_user_id": reported_user.get("user_id"),
        "reported_email": reported_user.get("email"),
        "reported_name": reported_user.get("name"),
        "reporter_sid": sid, "reporter_ip": reporter_ip,
        "reporter_user_id": reporter_user.get("user_id"),
        "reporter_email": reporter_user.get("email"),
        "reporter_name": reporter_user.get("name"),
        "comment": comment, "chat_history": chat_history,
        "room_id": room_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    reports.append(report)
    try:
        await reports_collection.insert_one({**report, "_created_at": datetime.now(timezone.utc)})
    except Exception as e:
        logger.error(f"Failed to persist report to MongoDB: {e}")

    if reported_ip != "unknown":
        ip_report_count[reported_ip] = ip_report_count.get(reported_ip, 0) + 1
        if ip_report_count[reported_ip] >= 3:
            block_until = datetime.now(timezone.utc) + timedelta(days=3)
            ip_blocks[reported_ip] = block_until
            logger.info(f"IP {reported_ip} blocked for 3 days due to multiple reports")
            await sio.emit("blocked", {"message": "You have been blocked due to multiple reports."}, room=reported_sid)
            await sio.disconnect(reported_sid)

    await sio.emit("report_submitted", {"success": True, "message": "Report submitted successfully."}, room=sid)


# ─── Match helpers ─────────────────────────────────────────────────────────
async def try_match(city: str):
    if city not in waiting_queue or len(waiting_queue[city]) < 2:
        if city in waiting_queue and len(waiting_queue[city]) == 1:
            for other_city, other_users in waiting_queue.items():
                if other_city != city and len(other_users) >= 1:
                    user1_sid = waiting_queue[city][0]
                    user2_sid = other_users[0]
                    if user1_sid == user2_sid:
                        continue
                    waiting_queue[city].pop(0)
                    other_users.pop(0)
                    if not waiting_queue[city]:
                        del waiting_queue[city]
                    if not other_users and other_city in waiting_queue:
                        del waiting_queue[other_city]
                    await create_match(user1_sid, user2_sid)
                    return
        return
    user1_sid = waiting_queue[city][0]
    user2_sid = waiting_queue[city][1]
    if user1_sid == user2_sid:
        waiting_queue[city].pop(0)
        return
    waiting_queue[city].pop(0)
    waiting_queue[city].pop(0)
    if not waiting_queue[city]:
        del waiting_queue[city]
    await create_match(user1_sid, user2_sid)


async def create_match(user1_sid: str, user2_sid: str):
    if user1_sid == user2_sid:
        return False
    if user1_sid not in active_connections or user2_sid not in active_connections:
        return False
    if user1_sid in user_rooms or user2_sid in user_rooms:
        return False

    room_id = str(uuid.uuid4())
    active_chats[room_id] = [user1_sid, user2_sid]
    user_rooms[user1_sid] = room_id
    user_rooms[user2_sid] = room_id
    user1_data = active_connections.get(user1_sid, {})
    user2_data = active_connections.get(user2_sid, {})
    await sio.emit("match_found", {
        "room_id": room_id,
        "partner": {"name": user2_data.get("name", "Anonymous"), "emoji": user2_data.get("emoji", "😊")},
    }, room=user1_sid)
    await sio.emit("match_found", {
        "room_id": room_id,
        "partner": {"name": user1_data.get("name", "Anonymous"), "emoji": user1_data.get("emoji", "😊")},
    }, room=user2_sid)
    return True


async def try_global_match_after_delay(sid: str, delay: int):
    await asyncio.sleep(delay)
    if sid in user_rooms:
        return
    for city, users in list(waiting_queue.items()):
        if sid not in users:
            continue
        for other_city, other_users in list(waiting_queue.items()):
            if not other_users:
                continue
            if other_city == city and len(other_users) <= 1:
                continue
            if sid in waiting_queue.get(city, []):
                waiting_queue[city].remove(sid)
                if not waiting_queue[city]:
                    del waiting_queue[city]
            other_sid = other_users[0]
            if other_sid == sid:
                continue
            other_users.pop(0)
            if not other_users and other_city in waiting_queue:
                del waiting_queue[other_city]
            await create_match(sid, other_sid)
            return


async def delete_photo_after_delay(photo_id: str, delay: int):
    await asyncio.sleep(delay)
    if photo_id in photo_messages:
        photo_info = photo_messages[photo_id]
        await sio.emit("photo_deleted", {"photo_id": photo_id}, room=photo_info["sender_sid"])
        await sio.emit("photo_deleted", {"photo_id": photo_id}, room=photo_info["receiver_sid"])
        del photo_messages[photo_id]
    logger.info(f"Photo {photo_id} expired and deleted")


async def broadcast_stats():
    stats = {
        "online": len(active_connections),
        "chats_today": len(active_chats) * 10,
        "cities": len(city_users),
        "city_counts": city_users,
    }
    await sio.emit("stats_update", stats)


# Combine FastAPI and Socket.IO
socket_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/api/socket.io")
app = socket_app  # uvicorn entry point


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=False)
