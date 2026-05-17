from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import socketio
import os
import asyncio
import random
import base64
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Set
from dotenv import load_dotenv
from pathlib import Path
import uuid
import logging
import time
import secrets
import hashlib
import re
import requests
from urllib.parse import urlencode
from db import users_collection, reports_collection, sessions_collection, otp_collection, init_indexes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory storage (no database)
waiting_queue: Dict[str, List[str]] = {}  # city -> [socket_ids]
active_connections: Dict[str, dict] = {}  # socket_id -> user_data
city_users: Dict[str, int] = {}  # city -> count
active_chats: Dict[str, List[str]] = {}  # room_id -> [socket_id1, socket_id2]
user_rooms: Dict[str, str] = {}  # socket_id -> room_id
photo_timers: Dict[str, dict] = {}  # room_id -> {photo_data, timestamp}

# Report & IP blocking system
reports: List[dict] = []  # List of report records
ip_blocks: Dict[str, datetime] = {}  # ip -> block_expires_at
user_ip_map: Dict[str, str] = {}  # socket_id -> ip_address
ip_report_count: Dict[str, int] = {}  # ip -> report_count

# In-memory storage for user sessions (Google Auth)
user_sessions: Dict[str, dict] = {}  # session_token -> {user_id, email, name, picture, expires_at}
users_db: Dict[str, dict] = {}  # user_id -> {user_id, email, name, picture, created_at}
google_auth_states: Dict[str, datetime] = {}  # state -> created_at (for CSRF protection)

# Google OAuth Config
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI', '')

# Photo tracking for disappearing photos
photo_messages: Dict[str, dict] = {}  # photo_id -> {sender_sid, receiver_sid, opened, timer_started}

# Trusted origins for Socket.IO CORS
SOCKETIO_ALLOWED_ORIGINS = [
    "https://stumblechat.online",
    "https://www.stumblechat.online",
    "https://socket-io-staging.preview.emergentagent.com",
    "http://localhost:3000",
]

# Socket.IO server — strong connection config for mobile users
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=SOCKETIO_ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
    transports=['websocket', 'polling'],
    ping_timeout=60,
    ping_interval=20,
    max_http_buffer_size=10*1024*1024,
    async_handlers=True,
    always_connect=True
)

# FastAPI app with lifespan to start Telegram bot
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app_instance):
    # Initialize MongoDB indexes
    try:
        await init_indexes()
        logger.info("MongoDB indexes initialized")
    except Exception as e:
        logger.error(f"Failed to initialize MongoDB indexes: {e}")

    bot_task = None
    telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if telegram_token and telegram_token != "your_bot_token_here":
        try:
            from bot import run_bot
            # Wait briefly to catch immediate startup errors
            bot_task = asyncio.create_task(run_bot())
            await asyncio.sleep(3)
            if bot_task.done():
                exc = bot_task.exception()
                if exc:
                    logger.error(f"Telegram bot crashed on startup: {exc}")
            else:
                logger.info("Telegram bot started successfully")
        except ImportError as e:
            logger.error(f"Failed to import Telegram bot (missing dependency): {e}")
        except Exception as e:
            logger.error(f"Failed to start Telegram bot: {e}")
    else:
        logger.info("Telegram bot disabled (no token configured)")

    yield

    if bot_task and not bot_task.done():
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass
        logger.info("Telegram bot stopped")

app = FastAPI(lifespan=lifespan)
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")

# Trusted frontend origins for CORS and postMessage security
ALLOWED_ORIGINS = [
    "https://stumblechat.online",
    "https://www.stumblechat.online",
    "https://socket-io-staging.preview.emergentagent.com",
    "http://localhost:3000",
]

# Add any additional origins from environment
EXTRA_ORIGINS = os.environ.get("CORS_ORIGINS", "").split(",")
for origin in EXTRA_ORIGINS:
    origin = origin.strip()
    if origin and origin != "*" and origin not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

@app.get('/health')
async def health_check():
    """Health check endpoint for deployment"""
    return {
        'status': 'healthy',
        'service': 'chat-server',
        'online_users': len(active_connections),
        'active_chats': len(active_chats)
    }

@app.get('/api/')
async def root():
    return {'message': 'Chat server running'}

# ============================================
# DIRECT GOOGLE OAUTH ENDPOINTS (StumbleChat)
# ============================================

@app.get('/api/auth/google/start')
async def google_auth_start(request: Request):
    """Start Google OAuth flow - returns URL to redirect user to"""
    if not GOOGLE_CLIENT_ID:
        return {'ok': False, 'message': 'Google OAuth not configured'}
    
    # Use configured GOOGLE_REDIRECT_URI if set (for production with custom domain)
    # Otherwise, dynamically determine from request (for local/preview testing)
    if GOOGLE_REDIRECT_URI:
        redirect_uri = GOOGLE_REDIRECT_URI
    else:
        host = request.headers.get('host', '')
        scheme = request.headers.get('x-forwarded-proto', 'https')
        redirect_uri = f"{scheme}://{host}/api/auth/google/callback"
    
    # Generate CSRF state token
    state = secrets.token_urlsafe(32)
    google_auth_states[state] = datetime.now(timezone.utc)
    
    # Clean up old states (older than 10 minutes)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    expired_states = [s for s, t in google_auth_states.items() if t < cutoff]
    for s in expired_states:
        del google_auth_states[s]
    
    # Build Google OAuth URL
    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'prompt': 'select_account',
        'access_type': 'offline'
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    
    logger.info(f"Google OAuth started with redirect_uri: {redirect_uri}")
    
    return {'ok': True, 'auth_url': auth_url, 'state': state}

@app.get('/api/auth/google/callback')
async def google_auth_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Handle Google OAuth callback. Thin orchestrator — see helpers below."""
    frontend_origin = _resolve_trusted_origin(request)
    redirect_uri = _resolve_redirect_uri(request)

    if error:
        logger.error(f"Google OAuth error: {error}")
        return _oauth_popup_error(error, frontend_origin)

    if not state or state not in google_auth_states:
        logger.error("Invalid or missing state parameter")
        return _oauth_popup_error('Invalid state', frontend_origin)
    del google_auth_states[state]

    if not code:
        return _oauth_popup_error('No authorization code', frontend_origin)

    try:
        profile = _exchange_code_for_profile(code, redirect_uri)
        user_id = await _upsert_user_from_google(profile)
        session_token = await _issue_session(user_id, profile['email'], profile['name'], profile.get('picture', ''))
        return _oauth_popup_success(
            user_id=user_id,
            email=profile['email'],
            name=profile['name'],
            picture=profile.get('picture', ''),
            session_token=session_token,
            frontend_origin=frontend_origin,
        )
    except Exception as e:
        logger.error(f"Google OAuth error: {e}")
        return _oauth_popup_error('Authentication failed', frontend_origin)


# ── OAuth helper functions ───────────────────────────────────────────────────

def _resolve_trusted_origin(request: Request) -> str:
    """Pick a trusted frontend origin for postMessage. Defaults to production."""
    referer = request.headers.get('referer', '')
    origin = request.headers.get('origin', '')
    for allowed in ALLOWED_ORIGINS:
        if allowed in referer or allowed in origin:
            return allowed
    return "https://stumblechat.online"


def _resolve_redirect_uri(request: Request) -> str:
    if GOOGLE_REDIRECT_URI:
        return GOOGLE_REDIRECT_URI
    host = request.headers.get('host', '')
    scheme = request.headers.get('x-forwarded-proto', 'https')
    return f"{scheme}://{host}/api/auth/google/callback"


def _oauth_popup_error(message: str, frontend_origin: str) -> Response:
    safe_msg = (message or '').replace("'", "\\'").replace('\n', ' ')
    html = (
        f"<html><body><script>"
        f"window.opener && window.opener.postMessage("
        f"{{type:'google-auth-error', message:'{safe_msg}'}}, '{frontend_origin}');"
        f"window.close();</script></body></html>"
    )
    return Response(content=html, media_type="text/html")


def _oauth_popup_success(*, user_id: str, email: str, name: str, picture: str,
                        session_token: str, frontend_origin: str) -> Response:
    import json as _json
    user_data = {
        'user_id': user_id,
        'email': email,
        'name': name,
        'picture': picture,
        'session_token': session_token,
    }
    user_json = _json.dumps(user_data)
    html = (
        f"<html><body><script>"
        f"window.opener && window.opener.postMessage("
        f"{{type:'google-auth-success', user:{user_json}}}, '{frontend_origin}');"
        f"window.close();</script></body></html>"
    )
    resp = Response(content=html, media_type="text/html")
    _set_session_cookie(resp, session_token)
    return resp


def _exchange_code_for_profile(code: str, redirect_uri: str) -> dict:
    """Exchange Google auth code for a profile dict {email,name,picture}."""
    token_response = requests.post(
        'https://oauth2.googleapis.com/token',
        data={
            'code': code,
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
        },
        timeout=10,
    )
    if token_response.status_code != 200:
        logger.error(f"Token exchange failed: {token_response.text}")
        raise RuntimeError("Token exchange failed")

    access_token = token_response.json().get('access_token')
    if not access_token:
        raise RuntimeError("No access token received")

    profile_response = requests.get(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=10,
    )
    if profile_response.status_code != 200:
        raise RuntimeError("Failed to get user profile")

    profile = profile_response.json()
    email = (profile.get('email') or '').strip().lower()
    if not email:
        raise RuntimeError("No email in profile")
    return {
        'email': email,
        'name': profile.get('name', ''),
        'picture': profile.get('picture', ''),
    }


async def _upsert_user_from_google(profile: dict) -> str:
    """Insert/update a user in MongoDB using a Google profile. Returns user_id."""
    email = profile['email']
    name = profile['name']
    picture = profile.get('picture', '')
    existing = await users_collection.find_one({'email': email}, {'_id': 0})
    now_iso = datetime.now(timezone.utc).isoformat()

    if existing:
        user_id = existing['user_id']
        await users_collection.update_one(
            {'email': email},
            {'$set': {'name': name, 'picture': picture, 'last_login_at': now_iso, 'provider': 'google'}},
        )
        logger.info(f"Existing user logged in: {email}")
    else:
        user_id = f"user_{secrets.token_hex(6)}"
        await users_collection.insert_one({
            'user_id': user_id,
            'email': email,
            'name': name,
            'picture': picture,
            'provider': 'google',
            'created_at': now_iso,
            'last_login_at': now_iso,
        })
        logger.info(f"New StumbleChat user created (google): {email}")

    users_db[user_id] = {
        'user_id': user_id,
        'email': email,
        'name': name,
        'picture': picture,
        'provider': 'google',
        'created_at': now_iso,
    }
    return user_id


async def _issue_session(user_id: str, email: str, name: str, picture: str) -> str:
    """Create a new session token, persist it, cache it, and return the token."""
    session_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await sessions_collection.insert_one({
        'session_token': session_token,
        'user_id': user_id,
        'email': email,
        'name': name,
        'picture': picture,
        'expires_at': expires_at,
        'created_at': datetime.now(timezone.utc),
    })
    user_sessions[session_token] = {
        'user_id': user_id,
        'email': email,
        'name': name,
        'picture': picture,
        'expires_at': expires_at.isoformat(),
    }
    return session_token


def _set_session_cookie(response: Response, session_token: str) -> None:
    """Set an httpOnly, SameSite=None, Secure cookie carrying the session token."""
    response.set_cookie(
        key='session_token',
        value=session_token,
        max_age=7 * 24 * 60 * 60,  # 7 days
        httponly=True,
        secure=True,
        samesite='none',
        path='/',
    )


@app.get('/api/auth/me')
async def get_current_user(request: Request):
    """Get current authenticated user from session cookie or Authorization header"""
    # Try cookie first
    session_token = request.cookies.get('session_token')
    
    # Fallback to Authorization header
    if not session_token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            session_token = auth_header[7:]
    
    if not session_token:
        return Response(status_code=401, content='{"ok": false, "message": "Not authenticated"}', media_type='application/json')

    # Check in-memory cache first; fall back to MongoDB
    session = user_sessions.get(session_token)
    if not session:
        db_session = await sessions_collection.find_one({'session_token': session_token}, {'_id': 0})
        if db_session:
            # Rehydrate in-memory cache
            expires_at_val = db_session.get('expires_at')
            if isinstance(expires_at_val, datetime):
                expires_iso = expires_at_val.isoformat()
            else:
                expires_iso = expires_at_val
            session = {
                'user_id': db_session['user_id'],
                'email': db_session['email'],
                'name': db_session.get('name', ''),
                'picture': db_session.get('picture', ''),
                'expires_at': expires_iso
            }
            user_sessions[session_token] = session

    if not session:
        return Response(status_code=401, content='{"ok": false, "message": "Not authenticated"}', media_type='application/json')

    # Check expiry
    expires_at = datetime.fromisoformat(session['expires_at'])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        user_sessions.pop(session_token, None)
        await sessions_collection.delete_one({'session_token': session_token})
        return Response(status_code=401, content='{"ok": false, "message": "Session expired"}', media_type='application/json')
    
    return {
        'ok': True,
        'user': {
            'user_id': session['user_id'],
            'email': session['email'],
            'name': session['name'],
            'picture': session['picture']
        }
    }

@app.post('/api/auth/logout')
async def logout(request: Request, response: Response):
    """Logout and clear session"""
    session_token = request.cookies.get('session_token')
    if not session_token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            session_token = auth_header[7:]

    if session_token:
        user_sessions.pop(session_token, None)
        await sessions_collection.delete_one({'session_token': session_token})

    response.delete_cookie(key='session_token', path='/')
    
    return {'ok': True, 'message': 'Logged out successfully'}


# ============================================
# EMAIL OTP AUTH ENDPOINTS
# ============================================

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


@app.post('/api/auth/email/send-otp')
async def email_send_otp(request: Request):
    """Generate a 6-digit OTP for the given email and store it (hashed) in MongoDB.
    NOTE: This returns the OTP in the response for demo/dev only — wire to an email
    provider (Resend/SendGrid) before going to production.
    """
    body = await request.json()
    email = (body.get('email') or '').strip().lower()

    if not EMAIL_RE.match(email):
        return Response(status_code=400, content='{"ok": false, "message": "Invalid email"}', media_type='application/json')

    code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    await otp_collection.update_one(
        {'email': email},
        {'$set': {
            'email': email,
            'code_hash': _hash_otp(code),
            'expires_at': expires_at,
            'attempts': 0,
            'created_at': datetime.now(timezone.utc)
        }},
        upsert=True
    )

    logger.info(f"OTP generated for {email}")
    # DEV ONLY: return code for demo testing. Remove this in production once email delivery is wired.
    return {'ok': True, 'message': 'OTP sent', 'dev_code': code}


@app.post('/api/auth/email/verify-otp')
async def email_verify_otp(request: Request):
    """Verify OTP, create/update user, and issue a session token. Sets an httpOnly cookie."""
    body = await request.json()
    email = (body.get('email') or '').strip().lower()
    code = (body.get('code') or '').strip()
    name = (body.get('name') or '').strip() or email.split('@')[0]

    if not EMAIL_RE.match(email) or not code:
        return Response(status_code=400, content='{"ok": false, "message": "Invalid input"}', media_type='application/json')

    otp_doc = await otp_collection.find_one({'email': email})
    validation_error = await _validate_otp(otp_doc, email, code)
    if validation_error is not None:
        return validation_error

    # Success — consume OTP
    await otp_collection.delete_one({'email': email})

    user_id = await _upsert_email_user(email, name)
    session_token = await _issue_session(user_id, email, name, '')

    body_json = {
        'ok': True,
        'user': {
            'user_id': user_id,
            'email': email,
            'name': name,
            'picture': '',
            'session_token': session_token,
        },
    }
    import json as _json
    resp = Response(content=_json.dumps(body_json), media_type='application/json')
    _set_session_cookie(resp, session_token)
    return resp


async def _validate_otp(otp_doc: Optional[dict], email: str, code: str) -> Optional[Response]:
    """Return an error Response if OTP is missing/expired/over-limit/wrong; else None."""
    if not otp_doc:
        return Response(status_code=400, content='{"ok": false, "message": "No OTP requested"}', media_type='application/json')

    expires_at = otp_doc.get('expires_at')
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            await otp_collection.delete_one({'email': email})
            return Response(status_code=400, content='{"ok": false, "message": "OTP expired"}', media_type='application/json')

    if otp_doc.get('attempts', 0) >= 5:
        await otp_collection.delete_one({'email': email})
        return Response(status_code=429, content='{"ok": false, "message": "Too many attempts"}', media_type='application/json')

    if _hash_otp(code) != otp_doc.get('code_hash'):
        await otp_collection.update_one({'email': email}, {'$inc': {'attempts': 1}})
        return Response(status_code=400, content='{"ok": false, "message": "Invalid code"}', media_type='application/json')

    return None


async def _upsert_email_user(email: str, name: str) -> str:
    """Insert or update a user authenticated via email/OTP. Returns user_id."""
    existing = await users_collection.find_one({'email': email}, {'_id': 0})
    now_iso = datetime.now(timezone.utc).isoformat()

    if existing:
        user_id = existing['user_id']
        await users_collection.update_one(
            {'email': email},
            {'$set': {'name': name, 'last_login_at': now_iso, 'provider': existing.get('provider', 'email')}},
        )
    else:
        user_id = f"user_{secrets.token_hex(6)}"
        await users_collection.insert_one({
            'user_id': user_id,
            'email': email,
            'name': name,
            'picture': '',
            'provider': 'email',
            'created_at': now_iso,
            'last_login_at': now_iso,
        })
        logger.info(f"New StumbleChat user created (email): {email}")

    users_db[user_id] = {
        'user_id': user_id,
        'email': email,
        'name': name,
        'picture': '',
        'provider': 'email',
        'created_at': now_iso,
    }
    return user_id

@app.get('/api/check-ip')
async def check_ip_block(request: Request):
    """Check if an IP is blocked"""
    client_ip = request.headers.get('x-forwarded-for', request.client.host)
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    # Clean up expired blocks
    now = datetime.now(timezone.utc)
    expired = [ip for ip, expires in ip_blocks.items() if expires < now]
    for ip in expired:
        del ip_blocks[ip]
        if ip in ip_report_count:
            del ip_report_count[ip]
    
    if client_ip in ip_blocks:
        remaining = ip_blocks[client_ip] - now
        hours_remaining = int(remaining.total_seconds() // 3600)
        return {
            'blocked': True,
            'hours_remaining': hours_remaining,
            'message': f'You are temporarily blocked. Try again in {hours_remaining} hours.'
        }
    
    return {'blocked': False}


# ============================================
# ADMIN ENDPOINTS — list persisted users & reports
# ============================================

ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', '')


def _require_admin(request: Request) -> bool:
    if not ADMIN_TOKEN:
        return False
    provided = request.headers.get('x-admin-token') or request.query_params.get('token')
    return provided == ADMIN_TOKEN


@app.get('/api/admin/users')
async def admin_list_users(request: Request, limit: int = 100, skip: int = 0):
    if not _require_admin(request):
        return Response(status_code=401, content='{"ok": false, "message": "Unauthorized"}', media_type='application/json')

    cursor = users_collection.find({}, {'_id': 0}).sort('created_at', -1).skip(skip).limit(min(limit, 500))
    users = await cursor.to_list(length=limit)
    total = await users_collection.count_documents({})
    return {'ok': True, 'total': total, 'users': users}


@app.get('/api/admin/reports')
async def admin_list_reports(request: Request, limit: int = 100, skip: int = 0):
    if not _require_admin(request):
        return Response(status_code=401, content='{"ok": false, "message": "Unauthorized"}', media_type='application/json')

    cursor = reports_collection.find({}, {'_id': 0, '_created_at': 0}).sort('timestamp', -1).skip(skip).limit(min(limit, 500))
    items = await cursor.to_list(length=limit)
    total = await reports_collection.count_documents({})
    return {'ok': True, 'total': total, 'reports': items}

@app.get('/api/stats')
async def get_stats():
    total_online = len(active_connections)
    total_cities = len(city_users)
    total_chats = len(active_chats)
    
    return {
        'online': total_online,
        'chats_today': total_chats * 10,
        'cities': total_cities,
        'city_counts': city_users
    }

@app.get('/api/active-users')
async def get_active_users(city: Optional[str] = None):
    users = []
    for sid, user in active_connections.items():
        user_city = user.get('city', 'Global')
        if city and city != 'Global' and user_city != city:
            continue
        users.append({
            'sid': sid,
            'name': user.get('name', 'Anonymous'),
            'age': user.get('age', ''),
            'gender': user.get('gender', ''),
            'city': user_city,
            'emoji': user.get('emoji', '😊')
        })
    return {'users': users, 'count': len(users)}

# Socket.IO events
@sio.event
async def connect(sid, environ):
    print(f'[SOCKET] Client connected: {sid}', flush=True)
    logger.info(f'Client connected: {sid}')
    
    client_ip = environ.get('HTTP_X_FORWARDED_FOR', environ.get('REMOTE_ADDR', 'unknown'))
    if ',' in str(client_ip):
        client_ip = client_ip.split(',')[0].strip()
    user_ip_map[sid] = client_ip
    
    now = datetime.now(timezone.utc)
    if client_ip in ip_blocks and ip_blocks[client_ip] > now:
        print(f'[SOCKET] Blocked IP attempted connection: {client_ip}', flush=True)
        await sio.emit('blocked', {
            'message': 'You are temporarily blocked due to reports.'
        }, room=sid)
        await sio.disconnect(sid)
        return False
    
    await broadcast_stats()

@sio.event  
async def disconnect(sid):
    print(f'[SOCKET] Client disconnected: {sid}', flush=True)
    logger.info(f'Client disconnected: {sid}')
    
    if sid in active_connections:
        user_data = active_connections[sid]
        city = user_data.get('city', 'Unknown')
        
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
                    await sio.emit('partner_disconnected', room=partner_sid[0])
                del active_chats[room_id]
            del user_rooms[sid]
        
        del active_connections[sid]
    
    if sid in user_ip_map:
        del user_ip_map[sid]
    
    await broadcast_stats()

@sio.on('register_user')
async def handle_register_user(sid, data):
    print(f'[SOCKET] register_user event received from {sid}', flush=True)
    name = data.get('name', 'Anonymous')
    age = data.get('age', '')
    gender = data.get('gender', '')
    city = data.get('city', 'Global')
    session_token = data.get('session_token')

    # Resolve authenticated identity (if provided)
    auth_user = None
    if session_token:
        auth_user = user_sessions.get(session_token)
        if not auth_user:
            try:
                db_session = await sessions_collection.find_one({'session_token': session_token}, {'_id': 0})
                if db_session:
                    auth_user = {
                        'user_id': db_session['user_id'],
                        'email': db_session.get('email'),
                        'name': db_session.get('name'),
                        'picture': db_session.get('picture')
                    }
            except Exception as e:
                logger.error(f"Failed to resolve session for socket: {e}")
    
    print(f'[SOCKET] Registering user {sid}: name={name}, city={city}', flush=True)
    logger.info(f'Registering user {sid}: name={name}, city={city}')
    
    if sid in active_connections:
        old_city = active_connections[sid].get('city', 'Global')
        if old_city in city_users:
            city_users[old_city] = max(0, city_users[old_city] - 1)
            if city_users[old_city] == 0:
                del city_users[old_city]
        print(f'[SOCKET] User {sid} re-registering (reconnect). Old city: {old_city}', flush=True)
    
    active_connections[sid] = {
        'name': name,
        'age': age,
        'gender': gender,
        'city': city,
        'emoji': secrets.choice(['😊', '😎', '🤗', '😺', '🦊', '🐼', '🦄', '🌟']),
        'user_id': (auth_user or {}).get('user_id'),
        'email': (auth_user or {}).get('email'),
    }
    
    city_users[city] = city_users.get(city, 0) + 1
    
    print(f'[SOCKET] User {sid} registered in {city}. Total in city: {city_users[city]}', flush=True)
    logger.info(f'User {sid} registered successfully in {city}. Total in city: {city_users[city]}')
    
    await sio.emit('registered', {'success': True}, room=sid)
    await broadcast_stats()

@sio.on('join_queue')
async def handle_join_queue(sid, data):
    print(f'[SOCKET] join_queue event received from {sid}', flush=True)
    city = data.get('city', 'Unknown')
    target_sid = data.get('target_sid')
    
    print(f'[SOCKET] User {sid} joining queue for {city}', flush=True)
    
    if sid not in active_connections:
        await sio.emit('error', {'message': 'Please register first'}, room=sid)
        print(f'[SOCKET] User {sid} not registered, cannot join queue', flush=True)
        return
    
    if sid in user_rooms:
        print(f'[SOCKET] User {sid} already in a chat, cannot join queue', flush=True)
        return

    if target_sid and target_sid in active_connections and target_sid != sid and target_sid not in user_rooms:
        await create_match(sid, target_sid)
        return
    
    active_connections[sid]['city'] = city
    
    for queue_city, users in list(waiting_queue.items()):
        if sid in users:
            users.remove(sid)
            print(f'[SOCKET] Removed {sid} from {queue_city} queue to prevent duplicate', flush=True)
            if not users:
                del waiting_queue[queue_city]
    
    if city not in waiting_queue:
        waiting_queue[city] = []
    
    waiting_queue[city].append(sid)
    
    print(f'[SOCKET] User {sid} joined queue for {city}. Queue size: {len(waiting_queue[city])}', flush=True)
    logger.info(f'User {sid} joined queue for {city}. Queue size: {len(waiting_queue[city])}')
    
    await try_match(city)
    asyncio.create_task(try_global_match_after_delay(sid, 5))

@sio.on('send_message')
async def handle_send_message(sid, data):
    print(f'[MESSAGE] Received message from {sid}', flush=True)
    
    if sid not in user_rooms:
        print(f'[MESSAGE] User {sid} not in any room!', flush=True)
        await sio.emit('error', {'message': 'Not in a chat room'}, room=sid)
        return
    
    room_id = user_rooms[sid]
    message = data.get('message', '')
    timestamp = datetime.now(timezone.utc).isoformat()
    
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            print(f'[MESSAGE] Sending to partner {partner_sid[0]}', flush=True)
            await sio.emit('new_message', {
                'message': message,
                'timestamp': timestamp,
                'from': 'partner'
            }, room=partner_sid[0])
        else:
            await sio.emit('error', {'message': 'Partner not found'}, room=sid)
    else:
        await sio.emit('error', {'message': 'Chat room expired'}, room=sid)

@sio.on('send_photo')
async def handle_send_photo(sid, data):
    print(f'[PHOTO] Received photo from {sid}', flush=True)
    
    if sid not in user_rooms:
        return
    
    room_id = user_rooms[sid]
    photo_data = data.get('photo', '')
    
    if not photo_data:
        return
    
    photo_size_kb = len(photo_data) / 1024
    print(f'[PHOTO] Photo size: {photo_size_kb:.1f} KB', flush=True)
    
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            photo_id = str(uuid.uuid4())
            
            photo_messages[photo_id] = {
                'sender_sid': sid,
                'receiver_sid': partner_sid[0],
                'room_id': room_id,
                'photo': photo_data,
                'opened': False,
                'timer_started': False,
                'created_at': datetime.now(timezone.utc)
            }
            
            await sio.emit('photo_sent', {
                'photo': photo_data,
                'photo_id': photo_id
            }, room=sid)
            
            await sio.emit('new_photo', {
                'photo': photo_data,
                'photo_id': photo_id
            }, room=partner_sid[0])

@sio.on('photo_opened')
async def handle_photo_opened(sid, data):
    photo_id = data.get('photo_id')
    
    if photo_id not in photo_messages:
        return
    
    photo_info = photo_messages[photo_id]
    
    if not photo_info['timer_started']:
        photo_info['opened'] = True
        photo_info['timer_started'] = True
        
        sender_sid = photo_info['sender_sid']
        receiver_sid = photo_info['receiver_sid']
        
        await sio.emit('photo_timer_started', {
            'photo_id': photo_id,
            'duration': 15
        }, room=sender_sid)
        
        await sio.emit('photo_timer_started', {
            'photo_id': photo_id,
            'duration': 15
        }, room=receiver_sid)
        
        asyncio.create_task(delete_photo_after_delay(photo_id, 15))

@sio.on('skip_chat')
async def handle_skip_chat(sid, data):
    print(f'[SKIP] User {sid} clicked skip', flush=True)
    
    if sid in user_rooms:
        room_id = user_rooms[sid]
        
        if room_id in active_chats:
            partner_sid = [s for s in active_chats[room_id] if s != sid]
            
            if partner_sid:
                await sio.emit('partner_disconnected', room=partner_sid[0])
            
            if partner_sid and partner_sid[0] in user_rooms:
                del user_rooms[partner_sid[0]]
            
            del active_chats[room_id]
        
        del user_rooms[sid]
    
    await sio.emit('chat_ended', room=sid)
    
    if sid in active_connections:
        city = active_connections[sid]['city']
        print(f'[SKIP] User {sid} rejoining queue for {city}', flush=True)
        await handle_join_queue(sid, {'city': city})

@sio.on('disconnect_chat')
async def handle_disconnect_chat(sid, data=None):
    notify = data.get('notify', True) if data else True
    
    if sid in user_rooms:
        room_id = user_rooms[sid]
        
        if room_id in active_chats:
            partner_sid = [s for s in active_chats[room_id] if s != sid]
            
            if notify and partner_sid:
                await sio.emit('partner_disconnected', room=partner_sid[0])
            
            if partner_sid and partner_sid[0] in user_rooms:
                del user_rooms[partner_sid[0]]
            
            del active_chats[room_id]
        
        del user_rooms[sid]
    
    await sio.emit('chat_ended', room=sid)

@sio.on('leave_queue')
async def handle_leave_queue(sid, data=None):
    for city, users in list(waiting_queue.items()):
        if sid in users:
            users.remove(sid)
            print(f'[QUEUE] User {sid} removed from {city} queue (leave_queue)', flush=True)
            if not users:
                del waiting_queue[city]
    await sio.emit('queue_left', {}, room=sid)

@sio.on('audio_signal')
async def handle_audio_signal(sid, data):
    if sid not in user_rooms:
        return
    
    room_id = user_rooms[sid]
    
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            await sio.emit('audio_signal', data, room=partner_sid[0])

@sio.on('get_random_topic')
async def handle_get_random_topic(sid, data):
    topics = [
        'What\'s your favorite movie?',
        'If you could travel anywhere, where would it be?',
        'What\'s the best thing that happened to you this week?',
        'Do you have any hidden talents?',
        'What\'s your favorite food?',
        'If you could have dinner with anyone, who would it be?',
        'What\'s your dream job?',
        'What\'s the most adventurous thing you\'ve done?',
        'Are you a morning person or night owl?',
        'What\'s your favorite way to spend a weekend?'
    ]
    
    await sio.emit('random_topic', {'topic': secrets.choice(topics)}, room=sid)

@sio.on('report_user')
async def handle_report_user(sid, data):
    if sid not in user_rooms:
        return
    
    room_id = user_rooms[sid]
    comment = data.get('comment', '')
    chat_history = data.get('chat_history', [])
    
    if room_id not in active_chats:
        return
    
    partner_sid = [s for s in active_chats[room_id] if s != sid]
    if not partner_sid:
        return
    
    reported_sid = partner_sid[0]
    reported_ip = user_ip_map.get(reported_sid, 'unknown')
    reporter_ip = user_ip_map.get(sid, 'unknown')

    # Try to attach user identities (if reporter / reported are authenticated)
    reporter_user = active_connections.get(sid, {}) or {}
    reported_user = active_connections.get(reported_sid, {}) or {}

    report = {
        'id': str(uuid.uuid4()),
        'reported_sid': reported_sid,
        'reported_ip': reported_ip,
        'reported_user_id': reported_user.get('user_id'),
        'reported_email': reported_user.get('email'),
        'reported_name': reported_user.get('name'),
        'reporter_sid': sid,
        'reporter_ip': reporter_ip,
        'reporter_user_id': reporter_user.get('user_id'),
        'reporter_email': reporter_user.get('email'),
        'reporter_name': reporter_user.get('name'),
        'comment': comment,
        'chat_history': chat_history,
        'room_id': room_id,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    reports.append(report)

    # Persist to MongoDB
    try:
        await reports_collection.insert_one({**report, '_created_at': datetime.now(timezone.utc)})
    except Exception as e:
        logger.error(f"Failed to persist report to MongoDB: {e}")
    
    if reported_ip != 'unknown':
        ip_report_count[reported_ip] = ip_report_count.get(reported_ip, 0) + 1
        
        if ip_report_count[reported_ip] >= 3:
            block_until = datetime.now(timezone.utc) + timedelta(days=3)
            ip_blocks[reported_ip] = block_until
            
            print(f'[REPORT] IP {reported_ip} blocked until {block_until}', flush=True)
            logger.info(f'IP {reported_ip} blocked for 3 days due to multiple reports')
            
            await sio.emit('blocked', {
                'message': 'You have been blocked due to multiple reports.'
            }, room=reported_sid)
            
            await sio.disconnect(reported_sid)
    
    print(f'[REPORT] User {reported_sid} reported by {sid}. IP: {reported_ip}, Total reports: {ip_report_count.get(reported_ip, 1)}', flush=True)
    logger.info(f'User reported: {reported_sid} (IP: {reported_ip})')
    
    await sio.emit('report_submitted', {
        'success': True,
        'message': 'Report submitted successfully.'
    }, room=sid)

# Helper functions
async def try_match(city: str):
    print(f'[MATCH] try_match called for city: {city}', flush=True)
    
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
    """Create a chat match between two users with validation"""
    print(f'[MATCH] Attempting to create match between {user1_sid} and {user2_sid}', flush=True)
    
    # Prevent self-matching
    if user1_sid == user2_sid:
        print('[MATCH] Rejected: Cannot match user with themselves', flush=True)
        return False
    
    # Validate both users are still connected
    if user1_sid not in active_connections:
        print(f'[MATCH] Rejected: User {user1_sid} no longer connected', flush=True)
        return False
    
    if user2_sid not in active_connections:
        print(f'[MATCH] Rejected: User {user2_sid} no longer connected', flush=True)
        return False
    
    # Validate neither user is already in a room
    if user1_sid in user_rooms:
        print(f'[MATCH] Rejected: User {user1_sid} already in a room', flush=True)
        return False
    
    if user2_sid in user_rooms:
        print(f'[MATCH] Rejected: User {user2_sid} already in a room', flush=True)
        return False
    
    room_id = str(uuid.uuid4())
    active_chats[room_id] = [user1_sid, user2_sid]
    user_rooms[user1_sid] = room_id
    user_rooms[user2_sid] = room_id
    
    user1_data = active_connections.get(user1_sid, {})
    user2_data = active_connections.get(user2_sid, {})
    
    await sio.emit('match_found', {
        'room_id': room_id,
        'partner': {
            'name': user2_data.get('name', 'Anonymous'),
            'emoji': user2_data.get('emoji', '😊')
        }
    }, room=user1_sid)
    
    await sio.emit('match_found', {
        'room_id': room_id,
        'partner': {
            'name': user1_data.get('name', 'Anonymous'),
            'emoji': user1_data.get('emoji', '😊')
        }
    }, room=user2_sid)
    
    print(f'[MATCH] Successfully matched {user1_sid} and {user2_sid} in room {room_id}', flush=True)
    return True

async def try_global_match_after_delay(sid: str, delay: int):
    await asyncio.sleep(delay)
    
    if sid not in user_rooms:
        for city, users in list(waiting_queue.items()):
            if sid in users:
                for other_city, other_users in list(waiting_queue.items()):
                    if other_users and (other_city != city or len(other_users) > 1):
                        if sid in waiting_queue.get(city, []):
                            waiting_queue[city].remove(sid)
                            if not waiting_queue[city]:
                                del waiting_queue[city]
                        
                        other_sid = other_users[0]
                        if other_sid != sid:
                            other_users.pop(0)
                            if not other_users and other_city in waiting_queue:
                                del waiting_queue[other_city]
                            
                            await create_match(sid, other_sid)
                            return

async def delete_photo_after_delay(photo_id: str, delay: int):
    await asyncio.sleep(delay)
    
    if photo_id in photo_messages:
        photo_info = photo_messages[photo_id]
        sender_sid = photo_info['sender_sid']
        receiver_sid = photo_info['receiver_sid']
        
        await sio.emit('photo_deleted', {'photo_id': photo_id}, room=sender_sid)
        await sio.emit('photo_deleted', {'photo_id': photo_id}, room=receiver_sid)
        
        del photo_messages[photo_id]
        
    logger.info(f'Photo {photo_id} expired and deleted')

async def broadcast_stats():
    stats = {
        'online': len(active_connections),
        'chats_today': len(active_chats) * 10,
        'cities': len(city_users),
        'city_counts': city_users
    }
    await sio.emit('stats_update', stats)

# Combine FastAPI and Socket.IO
socket_app = socketio.ASGIApp(
    sio,
    other_asgi_app=app,
    socketio_path='/api/socket.io'
)

# Export for uvicorn
app = socket_app
