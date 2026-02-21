from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
import os
import asyncio
import random
import base64
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from dotenv import load_dotenv
from pathlib import Path
import uuid
import logging

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

# Socket.IO server with custom path
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False,
    path='/api/socket.io'
)

# FastAPI app
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

@app.get('/api/')
async def root():
    return {'message': 'Chat server running'}

@app.get('/api/stats')
async def get_stats():
    total_online = len(active_connections)
    total_cities = len(city_users)
    total_chats = len(active_chats)
    
    return {
        'online': total_online,
        'chats_today': total_chats * 10,  # Mock multiplier for demo
        'cities': total_cities,
        'city_counts': city_users
    }

# Socket.IO events
@sio.event
async def connect(sid, environ):
    logger.info(f'Client connected: {sid}')
    
@sio.event
async def disconnect(sid):
    logger.info(f'Client disconnected: {sid}')
    
    # Remove from active connections
    if sid in active_connections:
        user_data = active_connections[sid]
        city = user_data.get('city', 'Unknown')
        
        # Decrease city count
        if city in city_users:
            city_users[city] = max(0, city_users[city] - 1)
            if city_users[city] == 0:
                del city_users[city]
        
        # Remove from waiting queue
        if city in waiting_queue and sid in waiting_queue[city]:
            waiting_queue[city].remove(sid)
            if not waiting_queue[city]:
                del waiting_queue[city]
        
        # Notify partner if in active chat
        if sid in user_rooms:
            room_id = user_rooms[sid]
            if room_id in active_chats:
                partner_sid = [s for s in active_chats[room_id] if s != sid]
                if partner_sid:
                    await sio.emit('partner_disconnected', room=partner_sid[0])
                del active_chats[room_id]
            del user_rooms[sid]
        
        del active_connections[sid]
    
    # Broadcast updated stats
    await broadcast_stats()

@sio.event
async def register_user(sid, data):
    name = data.get('name', 'Anonymous')
    age = data.get('age', '')
    gender = data.get('gender', '')
    city = data.get('city', 'Unknown')
    
    active_connections[sid] = {
        'name': name,
        'age': age,
        'gender': gender,
        'city': city,
        'emoji': random.choice(['😊', '😎', '🤗', '😺', '🦊', '🐼', '🦄', '🌟'])
    }
    
    # Update city count
    city_users[city] = city_users.get(city, 0) + 1
    
    await sio.emit('registered', {'success': True}, room=sid)
    await broadcast_stats()

@sio.event
async def join_queue(sid, data):
    city = data.get('city', 'Unknown')
    
    if sid not in active_connections:
        await sio.emit('error', {'message': 'Please register first'}, room=sid)
        return
    
    # Update user city
    active_connections[sid]['city'] = city
    
    # Add to waiting queue
    if city not in waiting_queue:
        waiting_queue[city] = []
    
    if sid not in waiting_queue[city]:
        waiting_queue[city].append(sid)
    
    logger.info(f'User {sid} joined queue for {city}. Queue size: {len(waiting_queue[city])}')
    
    # Try to match immediately
    await try_match(city)

@sio.event
async def send_message(sid, data):
    if sid not in user_rooms:
        return
    
    room_id = user_rooms[sid]
    message = data.get('message', '')
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Send to partner only
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            await sio.emit('new_message', {
                'message': message,
                'timestamp': timestamp,
                'from': 'partner'
            }, room=partner_sid[0])

@sio.event
async def send_photo(sid, data):
    if sid not in user_rooms:
        return
    
    room_id = user_rooms[sid]
    photo_data = data.get('photo', '')
    
    # Send to partner
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            photo_id = str(uuid.uuid4())
            await sio.emit('new_photo', {
                'photo': photo_data,
                'photo_id': photo_id
            }, room=partner_sid[0])
            
            # Schedule auto-delete after 30 seconds
            asyncio.create_task(delete_photo_after_delay(photo_id, 30))

@sio.event
async def skip_chat(sid, data):
    await disconnect_chat(sid, notify_partner=True)
    
    # Rejoin queue immediately
    if sid in active_connections:
        city = active_connections[sid]['city']
        await join_queue(sid, {'city': city})

@sio.event
async def disconnect_chat(sid, data=None):
    notify = data.get('notify', True) if data else True
    
    if sid in user_rooms:
        room_id = user_rooms[sid]
        
        if room_id in active_chats:
            partner_sid = [s for s in active_chats[room_id] if s != sid]
            
            if notify and partner_sid:
                await sio.emit('partner_disconnected', room=partner_sid[0])
            
            # Clean up partner's room reference
            if partner_sid and partner_sid[0] in user_rooms:
                del user_rooms[partner_sid[0]]
            
            del active_chats[room_id]
        
        del user_rooms[sid]
    
    await sio.emit('chat_ended', room=sid)

@sio.event
async def audio_signal(sid, data):
    if sid not in user_rooms:
        return
    
    room_id = user_rooms[sid]
    
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            await sio.emit('audio_signal', data, room=partner_sid[0])

@sio.event
async def get_random_topic(sid, data):
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

# Helper functions
async def try_match(city: str):
    if city not in waiting_queue or len(waiting_queue[city]) < 2:
        return
    
    # Get two users from queue
    user1_sid = waiting_queue[city].pop(0)
    user2_sid = waiting_queue[city].pop(0)
    
    # Create room
    room_id = str(uuid.uuid4())
    active_chats[room_id] = [user1_sid, user2_sid]
    user_rooms[user1_sid] = room_id
    user_rooms[user2_sid] = room_id
    
    # Get user data
    user1_data = active_connections.get(user1_sid, {})
    user2_data = active_connections.get(user2_sid, {})
    
    # Notify both users
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
    
    logger.info(f'Matched {user1_sid} and {user2_sid} in room {room_id}')

async def delete_photo_after_delay(photo_id: str, delay: int):
    await asyncio.sleep(delay)
    # Photo is already sent and handled client-side
    logger.info(f'Photo {photo_id} expired')

async def broadcast_stats():
    stats = {
        'online': len(active_connections),
        'chats_today': len(active_chats) * 10,
        'cities': len(city_users),
        'city_counts': city_users
    }
    await sio.emit('stats_update', stats)

# Combine FastAPI and Socket.IO
socket_app = socketio.ASGIApp(sio, app)

# Export for uvicorn
app = socket_app
