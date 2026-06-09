"""
Stumble Chat – Telegram Bot
Place at: backend/bot.py

Connects Telegram users into the same matching queue as web app users.
City is always 'Global' — same silent behaviour as the web app (no prompts).

Requires: pip install python-telegram-bot==20.7
Env var:  TELEGRAM_BOT_TOKEN
"""

import asyncio
import html
import os
import secrets
import random
import logging
import sys
import uuid as _uuid
import base64 as _b64
import aiohttp
from datetime import datetime, timezone, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Shared state (imported from the running server.py module) ─────────────────
def _server_module():
    """Return the active server module instead of importing a duplicate copy."""
    module = sys.modules.get("server") or sys.modules.get("backend.server")
    if module is not None:
        return module
    try:
        import server as module
    except ModuleNotFoundError:
        from . import server as module
    return module


_server = _server_module()
active_connections = _server.active_connections
waiting_queue = _server.waiting_queue
user_rooms = _server.user_rooms
active_chats = _server.active_chats
city_users = _server.city_users
reports = _server.reports
user_ip_map = _server.user_ip_map
ip_report_count = _server.ip_report_count
ip_blocks = _server.ip_blocks
photo_messages = _server.photo_messages
delete_photo_after_delay = _server.delete_photo_after_delay
try_match = _server.try_match
try_global_match_after_delay = _server.try_global_match_after_delay
broadcast_stats = _server.broadcast_stats
sio = _server.sio

# ── Telegram-specific state ──────────────────────────────────────────────────
tg_users:  dict[int, dict] = {}  # chat_id → {sid, name}
sid_to_tg: dict[str, int]  = {}  # sid     → chat_id

# Re-engagement registry — persists across sessions in memory
# chat_id → {last_seen: datetime, last_notified: datetime | None, name: str}
user_registry: dict[int, dict] = {}

BOT_TOKEN    = os.environ.get("TELEGRAM_BOT_TOKEN", "")
BOT_USERNAME = os.environ.get("BOT_USERNAME", "StumbleChatBot")  # set in Emergent env vars

EMOJIS    = ['😊', '😎', '🤗', '😺', '🦊', '🐼', '🦄', '🌟']

WEB_APP_URL = "https://stumblechat.online"

# ── PostHog server-side analytics ────────────────────────────────────────────
POSTHOG_KEY = 'phc_xAvL2Iq4tFmANRE7kzbKwaSqp1HJjN7x48s3vr0CMjs'
POSTHOG_URL = 'https://us.i.posthog.com/capture/'

async def track(chat_id: int, event: str, properties: dict = None):
    """Send a server-side event to PostHog."""
    if properties is None:
        properties = {}
    payload = {
        'api_key':     POSTHOG_KEY,
        'event':       event,
        'distinct_id': f'tg_{chat_id}',
        'properties':  {
            'source':   'telegram',
            'platform': 'telegram',
            **properties,
        }
    }
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                POSTHOG_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=3),
            )
    except Exception as e:
        logger.warning(f"[ANALYTICS] PostHog track failed: {e}")

# Global application reference (set in create_bot_app)
application: Application = None  # type: ignore


# ── Helpers ───────────────────────────────────────────────────────────────────

def tg_sid(chat_id: int) -> str:
    return f"tg_{chat_id}"


def html_escape(value) -> str:
    return html.escape(str(value), quote=False)


def touch_user(chat_id: int, name: str = "Stranger"):
    """Update last_seen for a user. Call on every user interaction."""
    now = datetime.now(timezone.utc)
    if chat_id not in user_registry:
        user_registry[chat_id] = {
            'name':            name,
            'last_seen':       now,
            'last_notified':   None,
            'joined_at':       now,
            'chat_count':      0,
        }
    else:
        user_registry[chat_id]['last_seen'] = now
        if name and name != "Stranger":
            user_registry[chat_id]['name'] = name


async def tg_send(chat_id: int, text: str, reply_markup=None):
    """Send a Telegram message safely."""
    try:
        await application.bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode='HTML',
            reply_markup=reply_markup,
            disable_web_page_preview=True,
        )
    except Exception as e:
        logger.error(f"[TG] Failed to send to {chat_id}: {e}")


def _get_partner_data(sid: str) -> dict:
    """Look up partner name/emoji from active_connections."""
    room_id  = user_rooms.get(sid)
    if not room_id:
        return {}
    partners = [s for s in active_chats.get(room_id, []) if s != sid]
    if not partners:
        return {}
    return active_connections.get(partners[0], {})


# ── Monkey-patch sio.emit ─────────────────────────────────────────────────────
_original_emit = sio.emit


async def patched_emit(event: str, data=None, room=None, to=None, **kwargs):
    """
    Intercept Socket.IO emits destined for TG users → send via Telegram.
    Handles both room= and to= kwargs (python-socketio uses both).
    Falls through to normal Socket.IO for web users.
    """
    target = room or to
    if target and target in sid_to_tg:
        chat_id = sid_to_tg[target]
        await _handle_tg_event(chat_id, target, event, data or {})
    else:
        await _original_emit(event, data, room=room, to=to, **kwargs)


sio.emit = patched_emit


# ── Socket.IO event → Telegram message translator ────────────────────────────

async def _handle_tg_event(chat_id: int, sid: str, event: str, data: dict):
    """Convert every Socket.IO server event into a Telegram message."""

    # ── Matched ───────────────────────────────────────────────────────────────
    if event == 'match_found':
        partner = data.get('partner', {})
        name    = html_escape(partner.get('name', 'Stranger'))
        emoji   = html_escape(partner.get('emoji', '😊'))
        await track(chat_id, 'match_found')
        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("⏭ Skip",       callback_data="skip"),
                InlineKeyboardButton("🚫 Stop",       callback_data="disconnect"),
                InlineKeyboardButton("🚩 Report",     callback_data="report"),
            ],
            [InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL)]
        ])
        await tg_send(
            chat_id,
            f"🎉 <b>Connected with {emoji} {name}!</b>\n\n"
            f"Just type to chat.\n"
            f"/skip – next  |  /stop – disconnect  |  /report – report",
            reply_markup=keyboard,
        )

    # ── Incoming text message ─────────────────────────────────────────────────
    elif event == 'new_message':
        msg          = html_escape(data.get('message', ''))
        partner_data = _get_partner_data(sid)
        sender       = data.get('sender') or partner_data
        name         = html_escape(sender.get('name', 'Stranger'))
        emoji        = html_escape(sender.get('emoji', '💬'))
        await track(chat_id, 'message_received')
        await tg_send(chat_id, f"{emoji} <b>{name}:</b> {msg}")

    # ── Partner sent a photo ──────────────────────────────────────────────────
    elif event in ('new_photo', 'photo_received'):
        photo_id = data.get('photo_id', '')
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("📷 View on Stumble Chat", url="https://stumblechat.online"),
            InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL),
        ]])
        await tg_send(
            chat_id,
            "📷 <b>Your partner sent a photo.</b>\n"
            "Photos can only be viewed on the website.\n"
            "⏱ <i>It will auto-delete in 15 seconds.</i>",
            reply_markup=keyboard,
        )
        if photo_id and photo_id in photo_messages:
            info = photo_messages[photo_id]
            if not info['timer_started']:
                info['opened']        = True
                info['timer_started'] = True
                await _original_emit('photo_timer_started',
                    {'photo_id': photo_id, 'duration': 15}, room=info['sender_sid'])
                await _original_emit('photo_timer_started',
                    {'photo_id': photo_id, 'duration': 15}, room=info['receiver_sid'])
                asyncio.create_task(delete_photo_after_delay(photo_id, 15))

    # ── Photo timer started ───────────────────────────────────────────────────
    elif event == 'photo_timer_started':
        await tg_send(chat_id, "⏱ <i>Photo will disappear in 15 seconds.</i>")

    # ── Photo deleted ─────────────────────────────────────────────────────────
    elif event == 'photo_deleted':
        await tg_send(chat_id, "🗑 <i>Photo deleted.</i>")

    # ── Partner disconnected ──────────────────────────────────────────────────
    elif event == 'partner_disconnected':
        if chat_id in user_registry:
            user_registry[chat_id]["chat_count"] = user_registry[chat_id].get("chat_count", 0) + 1
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔍 Find new stranger", callback_data="connect")],
            [InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL)],
        ])
        await tg_send(
            chat_id,
            "👋 <b>Your partner disconnected.</b>\n\nTap below or /connect to chat again.",
            reply_markup=keyboard,
        )
        _remove_from_chat(sid)

    # ── Chat ended (skipped by partner) ──────────────────────────────────────
    elif event == 'chat_ended':
        if chat_id in user_registry:
            user_registry[chat_id]["chat_count"] = user_registry[chat_id].get("chat_count", 0) + 1
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔍 Find new stranger", callback_data="connect")],
            [InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL)],
        ])
        await tg_send(chat_id, "Chat ended. /connect to find someone new.", reply_markup=keyboard)
        _remove_from_chat(sid)

    # ── Error ─────────────────────────────────────────────────────────────────
    elif event == 'error':
        msg = html_escape(data.get('message', 'Something went wrong.'))
        await tg_send(chat_id, f"⚠️ {msg}")

    # ── Ignored events (UI-only / not applicable on Telegram) ────────────────
    elif event in (
        'stats_update', 'registered', 'waiting',
        'report_submitted', 'queue_left', 'blocked',
        'audio_signal',
    ):
        pass

    else:
        logger.debug(f"[TG] Unhandled event '{event}' for chat_id={chat_id}")


# ── State management ──────────────────────────────────────────────────────────

def _remove_from_chat(sid: str):
    """Remove TG user from active room only. Keeps tg_users so /connect works."""
    if sid in user_rooms:
        room_id = user_rooms.pop(sid)
        if room_id in active_chats:
            del active_chats[room_id]


def _full_cleanup(sid: str):
    """Remove TG user from ALL shared state dicts."""
    chat_id = sid_to_tg.pop(sid, None)
    if chat_id:
        tg_users.pop(chat_id, None)

    for city, users in list(waiting_queue.items()):
        if sid in users:
            users.remove(sid)
            if not users:
                del waiting_queue[city]

    if sid in user_rooms:
        room_id = user_rooms.pop(sid)
        if room_id in active_chats:
            partners = [s for s in active_chats[room_id] if s != sid]
            for partner_sid in partners:
                user_rooms.pop(partner_sid, None)
                asyncio.create_task(
                    _original_emit('partner_disconnected', room=partner_sid)
                )
            del active_chats[room_id]

    user_data = active_connections.pop(sid, {})
    city = user_data.get('city', 'Global')
    if city in city_users:
        city_users[city] = max(0, city_users[city] - 1)
        if city_users[city] == 0:
            del city_users[city]


async def _register_tg_user(chat_id: int, name: str) -> str:
    """Register (or re-register) a Telegram user. Always uses Global city."""
    sid = tg_sid(chat_id)
    _full_cleanup(sid)

    emoji = secrets.choice(EMOJIS)
    active_connections[sid] = {
        'name':        name,
        'age':         '',
        'gender':      '',
        'city':        'Global',
        'emoji':       emoji,
        'is_telegram': True,
    }
    tg_users[chat_id] = {'sid': sid, 'name': name}
    sid_to_tg[sid]    = chat_id
    city_users['Global'] = city_users.get('Global', 0) + 1
    await broadcast_stats()
    return sid


async def _join_queue(chat_id: int):
    """Put a Telegram user in the Global matching queue immediately."""
    user = tg_users.get(chat_id)
    if not user:
        await _register_tg_user(chat_id, "Stranger")
        user = tg_users[chat_id]

    sid = user['sid']

    if sid in user_rooms:
        await tg_send(chat_id, "You're already in a chat! /stop first.")
        return

    if any(sid in users for users in waiting_queue.values()):
        await tg_send(chat_id, "⏳ Already searching... please wait.")
        return

    waiting_queue.setdefault('Global', []).append(sid)
    await track(chat_id, 'join_queue')
    await tg_send(chat_id, "⏳ <b>Searching for a stranger...</b>")

    await try_match('Global')
    asyncio.create_task(try_global_match_after_delay(sid, 5))


# ── Command Handlers ──────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    name    = update.effective_user.first_name or "Stranger"

    existing = tg_users.get(chat_id)
    if existing and tg_sid(chat_id) in user_rooms:
        await tg_send(chat_id, "ℹ️ Your previous chat was ended.")

    await _register_tg_user(chat_id, name)
    await track(chat_id, 'session_start')
    touch_user(chat_id, name)
    safe_name = html_escape(name)

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("🔍 Find a Stranger", callback_data="connect")],
        [InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL)],
    ])
    await tg_send(
        chat_id,
        f"👋 <b>Welcome to Stumble Chat, {safe_name}!</b>\n\n"
        f"Connect with random strangers worldwide — anonymously, for free.\n\n"
        f"⚠️ <b>You must be 18+ to use this service.</b>\n"
        f"By continuing you agree to our "
        f'<a href="https://stumblechat.online/terms">Terms</a> and '
        f'<a href="https://stumblechat.online/guidelines">Community Guidelines</a>.\n\n'
        f"<b>Commands:</b>\n"
        f"/connect – Find a stranger\n"
        f"/skip    – Skip to next person\n"
        f"/StumbleChatOnline  – Open the web app\n"
        f"/stop    – Disconnect\n"
        f"/report  – Report current partner\n"
        f"/help    – Help",
        reply_markup=keyboard,
    )


async def cmd_connect(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    name    = update.effective_user.first_name or "Stranger"
    if chat_id not in tg_users:
        await _register_tg_user(chat_id, name)
    touch_user(chat_id, name)
    await _join_queue(chat_id)


async def cmd_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user    = tg_users.get(chat_id)
    if not user:
        await tg_send(chat_id, "Send /start first.")
        return

    sid = user['sid']
    await track(chat_id, 'skip_chat')

    if sid in user_rooms:
        room_id = user_rooms.pop(sid)
        if room_id in active_chats:
            partners = [s for s in active_chats[room_id] if s != sid]
            for p in partners:
                user_rooms.pop(p, None)
                asyncio.create_task(sio.emit('partner_disconnected', room=p))
            del active_chats[room_id]

    await _join_queue(chat_id)


async def cmd_stop(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user    = tg_users.get(chat_id)
    if not user:
        await tg_send(chat_id, "You're not connected to anyone.")
        return

    sid      = user['sid']
    in_chat  = sid in user_rooms
    in_queue = any(sid in users for users in waiting_queue.values())

    if not in_chat and not in_queue:
        await tg_send(chat_id, "You're not in a chat or queue. /connect to start.")
        return

    saved_name = user['name']
    await track(chat_id, 'disconnect_chat')
    _full_cleanup(sid)
    await _register_tg_user(chat_id, saved_name)

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("🔍 Find a new stranger", callback_data="connect")],
        [InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL)],
    ])
    await tg_send(
        chat_id,
        "👋 <b>Disconnected.</b>\n\nSend /connect whenever you want to chat again.",
        reply_markup=keyboard,
    )


async def cmd_report(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user    = tg_users.get(chat_id)
    if not user:
        await tg_send(chat_id, "Send /start first.")
        return

    sid = user['sid']
    if sid not in user_rooms:
        await tg_send(chat_id, "You're not in a chat — nothing to report.")
        return

    room_id  = user_rooms[sid]
    partners = [s for s in active_chats.get(room_id, []) if s != sid]
    if not partners:
        await tg_send(chat_id, "No partner found to report.")
        return

    reported_sid = partners[0]
    reported_ip  = user_ip_map.get(reported_sid, 'unknown')

    reports.append({
        'reporter_sid': sid,
        'reported_sid': reported_sid,
        'reported_ip':  reported_ip,
        'comment':      'Reported via Telegram bot',
        'timestamp':    datetime.now(timezone.utc).isoformat(),
        'chat_history': [],
    })

    if reported_ip != 'unknown':
        ip_report_count[reported_ip] = ip_report_count.get(reported_ip, 0) + 1
    if reported_ip != 'unknown' and ip_report_count[reported_ip] >= 3:
        ip_blocks[reported_ip] = datetime.now(timezone.utc) + timedelta(days=3)
        await _original_emit(
            'error',
            {'message': 'You have been blocked due to multiple reports.'},
            room=reported_sid,
        )
        if reported_sid in sid_to_tg:
            _full_cleanup(reported_sid)
        else:
            try:
                await sio.disconnect(reported_sid)
            except Exception:
                pass

    await track(chat_id, 'report_user')
    await tg_send(chat_id, "✅ <b>Report submitted.</b> Thank you for keeping Stumble Chat safe.")
    await cmd_skip(update, context)


async def cmd_webapp(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send the web app URL to the user."""
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL)
    ]])
    await tg_send(
        update.effective_chat.id,
        "Prefer the full experience? Click below to open the Stumble Chat web app.",
        reply_markup=keyboard
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await tg_send(
        update.effective_chat.id,
        "<b>Stumble Chat – Help</b>\n\n"
        "/connect – Find a random stranger\n"
        "/skip    – Skip to next stranger\n"
        "/stop    – Disconnect\n"
        "/report  – Report current partner\n"
        "/StumbleChatOnline  – Open the web app\n"
        "/help    – Show this message\n\n"
        "💬 Type normally to send messages when connected.\n"
        "📷 Send photos directly in this chat when connected.\n\n"
        "🌐 https://stumblechat.online\n"
        "📧 stumblechat.online@gmail.com",
    )


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handle photos sent by Telegram users.
    Downloads, converts to base64, injects into the shared pipeline
    exactly like a web user calling send_photo.
    """
    chat_id = update.effective_chat.id
    user    = tg_users.get(chat_id)
    if not user:
        await tg_send(chat_id, "Send /start to begin using Stumble Chat.")
        return

    touch_user(chat_id)
    sid = user['sid']
    if sid not in user_rooms:
        await tg_send(chat_id, "You're not connected to anyone. /connect first.")
        return

    room_id  = user_rooms[sid]
    partners = [s for s in active_chats.get(room_id, []) if s != sid]
    if not partners:
        await tg_send(chat_id, "Chat room not found. /connect to try again.")
        return

    partner_sid = partners[0]

    try:
        photo_file  = await update.message.photo[-1].get_file()
        photo_bytes = await photo_file.download_as_bytearray()
        photo_b64   = "data:image/jpeg;base64," + _b64.b64encode(bytes(photo_bytes)).decode()
    except Exception as e:
        logger.error(f"[TG] Photo download failed: {e}")
        await tg_send(chat_id, "⚠️ Failed to send photo. Please try again.")
        return

    photo_id = str(_uuid.uuid4())

    photo_messages[photo_id] = {
        'sender_sid':    sid,
        'receiver_sid':  partner_sid,
        'room_id':       room_id,
        'photo':         photo_b64,
        'opened':        False,
        'timer_started': False,
        'created_at':    datetime.now(timezone.utc),
    }

    await track(chat_id, 'photo_sent')
    await tg_send(chat_id, "📷 Photo sent! ⏱ Disappears 15s after your partner views it.")

    await sio.emit('new_photo', {'photo': photo_b64, 'photo_id': photo_id}, room=partner_sid)

    if partner_sid in sid_to_tg:
        photo_messages[photo_id]['opened']        = True
        photo_messages[photo_id]['timer_started'] = True
        await _original_emit('photo_timer_started',
            {'photo_id': photo_id, 'duration': 15}, room=sid)
        await _original_emit('photo_timer_started',
            {'photo_id': photo_id, 'duration': 15}, room=partner_sid)
        asyncio.create_task(delete_photo_after_delay(photo_id, 15))


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Forward text messages to the matched partner."""
    chat_id = update.effective_chat.id
    text    = update.message.text or ''

    user = tg_users.get(chat_id)
    if not user:
        await tg_send(chat_id, "Send /start to begin using Stumble Chat.")
        return

    touch_user(chat_id)
    sid = user['sid']

    if sid not in user_rooms:
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔍 Find a stranger", callback_data="connect"),
            InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL),
        ]])
        await tg_send(chat_id, "You're not connected to anyone yet.", reply_markup=keyboard)
        return

    room_id  = user_rooms[sid]
    partners = [s for s in active_chats.get(room_id, []) if s != sid]
    if not partners:
        await tg_send(chat_id, "Chat room not found. /connect to try again.")
        return

    user_data = active_connections.get(sid, {})
    await track(chat_id, 'message_sent')
    await sio.emit('new_message', {
        'message':   text,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'from':      'partner',
        'sender': {
            'name':  user_data.get('name', 'Stranger'),
            'emoji': user_data.get('emoji', '💬'),
        },
    }, room=partners[0])


async def handle_sticker(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Forward stickers to the matched partner."""
    chat_id = update.effective_chat.id
    user    = tg_users.get(chat_id)
    if not user:
        await tg_send(chat_id, "Send /start to begin using Stumble Chat.")
        return

    touch_user(chat_id)
    sid = user['sid']
    if sid not in user_rooms:
        await tg_send(chat_id, "You're not connected to anyone. /connect first.")
        return

    room_id  = user_rooms[sid]
    partners = [s for s in active_chats.get(room_id, []) if s != sid]
    if not partners:
        await tg_send(chat_id, "No partner found. Try /skip.")
        return

    partner_sid = partners[0]
    sticker     = update.message.sticker
    file_id     = sticker.file_id

    partner_chat_id = sid_to_tg.get(partner_sid)
    if partner_chat_id:
        try:
            await application.bot.send_sticker(chat_id=partner_chat_id, sticker=file_id)
        except Exception as e:
            logger.error(f"[TG] Failed to forward sticker: {e}")
    else:
        emoji = sticker.emoji or "🙂"
        await sio.emit('new_message', {
            'message':   emoji,
            'sender':    'stranger',
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }, room=partner_sid)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle inline keyboard button presses."""
    query   = update.callback_query
    chat_id = query.message.chat_id
    await query.answer()

    if query.data == "connect":
        if chat_id not in tg_users:
            await _register_tg_user(chat_id, update.effective_user.first_name or "Stranger")
        await _join_queue(chat_id)
    elif query.data == "skip":
        await cmd_skip(update, context)
    elif query.data == "disconnect":
        await cmd_stop(update, context)
    elif query.data == "report":
        await cmd_report(update, context)


# ── Re-engagement Notifier ────────────────────────────────────────────────────

async def _reengagement_loop():
    """
    Every hour: check for users inactive 3+ days.
    If the queue has someone waiting, notify each eligible user once every 2 days.
    """
    INACTIVE_THRESHOLD  = timedelta(days=3)
    NOTIFY_COOLDOWN     = timedelta(days=2)
    CHECK_INTERVAL_SECS = 3600

    await asyncio.sleep(60)
    logger.info("[Reengagement] Loop started")

    while True:
        try:
            queue_has_users = any(len(v) > 0 for v in waiting_queue.values())

            if queue_has_users:
                now      = datetime.now(timezone.utc)
                notified = 0

                for chat_id, info in list(user_registry.items()):
                    last_seen     = info.get("last_seen")
                    last_notified = info.get("last_notified")

                    if not last_seen:
                        continue
                    if (now - last_seen) < INACTIVE_THRESHOLD:
                        continue
                    if last_notified and (now - last_notified) < NOTIFY_COOLDOWN:
                        continue

                    sid = tg_sid(chat_id)
                    if sid in user_rooms:
                        continue
                    if any(sid in users for users in waiting_queue.values()):
                        continue

                    total_waiting = sum(len(v) for v in waiting_queue.values())
                    name = html_escape(info.get("name", "there"))

                    try:
                        keyboard = InlineKeyboardMarkup([
                            [InlineKeyboardButton("Find a Stranger", callback_data="connect")],
                            [InlineKeyboardButton("🌐 Go to Stumble chat online", url=WEB_APP_URL)],
                        ])
                        await tg_send(
                            chat_id,
                            f"Hey {name}! Someone is waiting to chat right now.\n\n"
                            f"{'👥 ' + str(total_waiting) + ' people' if total_waiting > 1 else '👤 1 person'} "
                            f"in the queue — you could match instantly.\n\n"
                            f"Tap below or send /connect to start.",
                            reply_markup=keyboard,
                        )
                        user_registry[chat_id]["last_notified"] = now
                        notified += 1
                        await asyncio.sleep(0.05)
                    except Exception as e:
                        logger.warning(f"[Reengagement] Failed to notify {chat_id}: {e}")

                if notified:
                    logger.info(f"[Reengagement] Notified {notified} inactive users")

        except Exception as e:
            logger.error(f"[Reengagement] Loop error: {e}")

        await asyncio.sleep(CHECK_INTERVAL_SECS)


# ── App setup ─────────────────────────────────────────────────────────────────

def create_bot_app() -> Application:
    global application
    application = Application.builder().token(BOT_TOKEN).build()

    application.add_handler(CommandHandler("start",              cmd_start))
    application.add_handler(CommandHandler("connect",            cmd_connect))
    application.add_handler(CommandHandler("skip",               cmd_skip))
    application.add_handler(CommandHandler("stop",               cmd_stop))
    application.add_handler(CommandHandler("report",             cmd_report))
    application.add_handler(CommandHandler("StumbleChatOnline",  cmd_webapp))
    application.add_handler(CommandHandler("help",               cmd_help))
    application.add_handler(MessageHandler(filters.PHOTO,                      handle_photo))
    application.add_handler(MessageHandler(filters.Sticker.ALL,                handle_sticker))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND,    handle_message))
    application.add_handler(CallbackQueryHandler(handle_callback))

    asyncio.get_event_loop().create_task(_reengagement_loop())

    return application


async def run_bot():
    app = create_bot_app()
    logger.info("[TG] Starting Stumble Chat Telegram Bot...")
    await app.initialize()
    await app.start()
    await app.updater.start_polling(drop_pending_updates=True)
    logger.info("[TG] Bot is running.")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(run_bot())
