"""
Centralized application state, configuration, and the Socket.IO server.

This module is imported by both server.py and all router modules so they can
share the same in-memory dicts and the single Socket.IO instance.
"""
import os
import socketio
from datetime import datetime
from typing import Dict, List
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ─── In-memory state (single source of truth) ──────────────────────────────
waiting_queue: Dict[str, List[str]] = {}          # city -> [socket_ids]
active_connections: Dict[str, dict] = {}          # socket_id -> user_data
city_users: Dict[str, int] = {}                   # city -> count
active_chats: Dict[str, List[str]] = {}           # room_id -> [sid1, sid2]
user_rooms: Dict[str, str] = {}                   # socket_id -> room_id
photo_timers: Dict[str, dict] = {}                # room_id -> photo timer
photo_messages: Dict[str, dict] = {}              # photo_id -> photo state

# Reports & IP blocking
reports: List[dict] = []
ip_blocks: Dict[str, datetime] = {}               # ip -> expires_at
user_ip_map: Dict[str, str] = {}                  # socket_id -> ip
ip_report_count: Dict[str, int] = {}              # ip -> report_count

# Auth (cached; MongoDB is source of truth)
user_sessions: Dict[str, dict] = {}               # session_token -> session
users_db: Dict[str, dict] = {}                    # user_id -> snapshot
google_auth_states: Dict[str, datetime] = {}      # state -> created_at (CSRF)

# ─── Configuration ─────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

ALLOWED_ORIGINS = [
    "https://stumblechat.online",
    "https://www.stumblechat.online",
    "https://socket-io-staging.preview.emergentagent.com",
    "https://socket-io-staging.cluster-5.preview.emergentcf.cloud",
    "http://localhost:3000",
]
for origin in os.environ.get("CORS_ORIGINS", "").split(","):
    o = origin.strip()
    if o and o != "*" and o not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(o)

# Image upload constraints
ALLOWED_PIC_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_PIC_BYTES = 2 * 1024 * 1024  # 2 MB
MAX_GALLERY_IMAGES = 5

# ─── Socket.IO server (single instance, mounted by server.py) ──────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
    transports=["websocket", "polling"],
    ping_timeout=60,
    ping_interval=20,
    max_http_buffer_size=10 * 1024 * 1024,
    async_handlers=True,
    always_connect=True,
)
