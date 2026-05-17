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
import requests
from urllib.parse import urlencode

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

# Socket.IO server — strong connection config for mobile users
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
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
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
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
async def google_auth_start():
    """Start Google OAuth flow - returns URL to redirect user to"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_REDIRECT_URI:
        return {'ok': False, 'message': 'Google OAuth not configured'}
    
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
        'redirect_uri': GOOGLE_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'prompt': 'select_account',
        'access_type': 'offline'
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    
    return {'ok': True, 'auth_url': auth_url, 'state': state}

@app.get('/api/auth/google/callback')
async def google_auth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Handle Google OAuth callback"""
    
    # Handle errors from Google
    if error:
        logger.error(f"Google OAuth error: {error}")
        return Response(
            content=f"""<html><body><script>
                window.opener && window.opener.postMessage({{type:'google-auth-error', message:'{error}'}}, '*');
                window.close();
            </script></body></html>""",
            media_type="text/html"
        )
    
    # Verify state (CSRF protection)
    if not state or state not in google_auth_states:
        logger.error("Invalid or missing state parameter")
        return Response(
            content="""<html><body><script>
                window.opener && window.opener.postMessage({type:'google-auth-error', message:'Invalid state'}, '*');
                window.close();
            </script></body></html>""",
            media_type="text/html"
        )
    
    # Remove used state
    del google_auth_states[state]
    
    if not code:
        return Response(
            content="""<html><body><script>
                window.opener && window.opener.postMessage({type:'google-auth-error', message:'No authorization code'}, '*');
                window.close();
            </script></body></html>""",
            media_type="text/html"
        )
    
    try:
        # Exchange code for tokens
        token_response = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'redirect_uri': GOOGLE_REDIRECT_URI,
                'grant_type': 'authorization_code'
            },
            timeout=10
        )
        
        if token_response.status_code != 200:
            logger.error(f"Token exchange failed: {token_response.text}")
            raise Exception("Token exchange failed")
        
        token_data = token_response.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            raise Exception("No access token received")
        
        # Get user profile from Google
        profile_response = requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10
        )
        
        if profile_response.status_code != 200:
            raise Exception("Failed to get user profile")
        
        profile = profile_response.json()
        email = (profile.get('email') or '').strip().lower()
        name = profile.get('name', '')
        picture = profile.get('picture', '')
        
        if not email:
            raise Exception("No email in profile")
        
        # Find or create user
        user_id = None
        for uid, udata in users_db.items():
            if udata.get('email') == email:
                user_id = uid
                break
        
        if not user_id:
            user_id = f"user_{secrets.token_hex(6)}"
            users_db[user_id] = {
                'user_id': user_id,
                'email': email,
                'name': name,
                'picture': picture,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            logger.info(f"New StumbleChat user created: {email}")
        else:
            # Update existing user
            users_db[user_id]['name'] = name
            users_db[user_id]['picture'] = picture
            logger.info(f"Existing user logged in: {email}")
        
        # Create session token
        session_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        user_sessions[session_token] = {
            'user_id': user_id,
            'email': email,
            'name': name,
            'picture': picture,
            'expires_at': expires_at.isoformat()
        }
        
        # Send success message to opener window
        user_data = {
            'user_id': user_id,
            'email': email,
            'name': name,
            'picture': picture,
            'session_token': session_token
        }
        
        import json
        user_json = json.dumps(user_data)
        
        return Response(
            content=f"""<html><body><script>
                window.opener && window.opener.postMessage({{type:'google-auth-success', user:{user_json}}}, '*');
                window.close();
            </script></body></html>""",
            media_type="text/html"
        )
        
    except Exception as e:
        logger.error(f"Google OAuth error: {e}")
        return Response(
            content="""<html><body><script>
                window.opener && window.opener.postMessage({type:'google-auth-error', message:'Authentication failed'}, '*');
                window.close();
            </script></body></html>""",
            media_type="text/html"
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
    
    if not session_token or session_token not in user_sessions:
        return Response(status_code=401, content='{"ok": false, "message": "Not authenticated"}', media_type='application/json')
    
    session = user_sessions[session_token]
    
    # Check expiry
    expires_at = datetime.fromisoformat(session['expires_at'])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        del user_sessions[session_token]
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
    
    if session_token and session_token in user_sessions:
        del user_sessions[session_token]
    
    response.delete_cookie(key='session_token', path='/')
    
    return {'ok': True, 'message': 'Logged out successfully'}

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
        'emoji': random.choice(['😊', '😎', '🤗', '😺', '🦊', '🐼', '🦄', '🌟'])
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
    
    await sio.emit('random_topic', {'topic': random.choice(topics)}, room=sid)

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
    
    report = {
        'id': str(uuid.uuid4()),
        'reported_sid': reported_sid,
        'reported_ip': reported_ip,
        'reporter_sid': sid,
        'reporter_ip': reporter_ip,
        'comment': comment,
        'chat_history': chat_history,
        'room_id': room_id,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    reports.append(report)
    
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
    print(f'[MATCH] Creating match between {user1_sid} and {user2_sid}', flush=True)
    
    if user1_sid == user2_sid:
        return
    
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
    
    print(f'[MATCH] Matched {user1_sid} and {user2_sid} in room {room_id}', flush=True)

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
