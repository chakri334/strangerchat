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

# Socket.IO server with polling transport
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False,
    transports=['polling']
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
    print(f'[SOCKET] Client connected: {sid}', flush=True)
    logger.info(f'Client connected: {sid}')
    # Send stats immediately
    await broadcast_stats()

@sio.event  
async def disconnect(sid):
    print(f'[SOCKET] Client disconnected: {sid}', flush=True)
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

@sio.on('register_user')
async def handle_register_user(sid, data):
    print(f'[SOCKET] register_user event received from {sid}', flush=True)
    name = data.get('name', 'Anonymous')
    age = data.get('age', '')
    gender = data.get('gender', '')
    city = data.get('city', 'Global')
    
    print(f'[SOCKET] Registering user {sid}: name={name}, city={city}', flush=True)
    logger.info(f'Registering user {sid}: name={name}, city={city}')
    
    active_connections[sid] = {
        'name': name,
        'age': age,
        'gender': gender,
        'city': city,
        'emoji': random.choice(['😊', '😎', '🤗', '😺', '🦊', '🐼', '🦄', '🌟'])
    }
    
    # Update city count
    city_users[city] = city_users.get(city, 0) + 1
    
    print(f'[SOCKET] User {sid} registered in {city}. Total in city: {city_users[city]}', flush=True)
    logger.info(f'User {sid} registered successfully in {city}. Total in city: {city_users[city]}')
    
    await sio.emit('registered', {'success': True}, room=sid)
    await broadcast_stats()

@sio.on('join_queue')
async def handle_join_queue(sid, data):
    print(f'[SOCKET] join_queue event received from {sid}', flush=True)
    city = data.get('city', 'Unknown')
    
    print(f'[SOCKET] User {sid} joining queue for {city}', flush=True)
    
    if sid not in active_connections:
        await sio.emit('error', {'message': 'Please register first'}, room=sid)
        print(f'[SOCKET] User {sid} not registered, cannot join queue', flush=True)
        return
    
    # Update user city
    active_connections[sid]['city'] = city
    
    # Add to waiting queue
    if city not in waiting_queue:
        waiting_queue[city] = []
    
    if sid not in waiting_queue[city]:
        waiting_queue[city].append(sid)
    
    print(f'[SOCKET] User {sid} joined queue for {city}. Queue size: {len(waiting_queue[city])}', flush=True)
    logger.info(f'User {sid} joined queue for {city}. Queue size: {len(waiting_queue[city])}')
    
    # Try to match immediately in same city
    await try_match(city)
    
    # If still waiting after 5 seconds, try matching with any city
    asyncio.create_task(try_global_match_after_delay(sid, 5))

@sio.on('send_message')
async def handle_send_message(sid, data):
    print(f'[MESSAGE] Received message from {sid}', flush=True)
    
    if sid not in user_rooms:
        print(f'[MESSAGE] User {sid} not in any room!', flush=True)
        return
    
    room_id = user_rooms[sid]
    message = data.get('message', '')
    timestamp = datetime.now(timezone.utc).isoformat()
    
    print(f'[MESSAGE] User {sid} in room {room_id} sending: "{message}"', flush=True)
    
    # Send to partner only
    if room_id in active_chats:
        partner_sid = [s for s in active_chats[room_id] if s != sid]
        if partner_sid:
            print(f'[MESSAGE] Sending to partner {partner_sid[0]}', flush=True)
            await sio.emit('new_message', {
                'message': message,
                'timestamp': timestamp,
                'from': 'partner'
            }, room=partner_sid[0])
            print(f'[MESSAGE] Message sent successfully to {partner_sid[0]}', flush=True)
        else:
            print(f'[MESSAGE] No partner found in room {room_id}', flush=True)
    else:
        print(f'[MESSAGE] Room {room_id} not in active_chats', flush=True)

@sio.on('send_photo')
async def handle_send_photo(sid, data):
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

@sio.on('skip_chat')
async def handle_skip_chat(sid, data):
    print(f'[SKIP] User {sid} clicked skip', flush=True)
    
    # Notify partner that user skipped (same as disconnect for partner)
    if sid in user_rooms:
        room_id = user_rooms[sid]
        
        if room_id in active_chats:
            partner_sid = [s for s in active_chats[room_id] if s != sid]
            
            if partner_sid:
                print(f'[SKIP] Notifying partner {partner_sid[0]} that user skipped', flush=True)
                await sio.emit('partner_disconnected', room=partner_sid[0])
            
            # Clean up partner's room reference
            if partner_sid and partner_sid[0] in user_rooms:
                del user_rooms[partner_sid[0]]
            
            del active_chats[room_id]
        
        del user_rooms[sid]
    
    await sio.emit('chat_ended', room=sid)
    
    # Rejoin queue immediately for the user who skipped
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
            
            # Clean up partner's room reference
            if partner_sid and partner_sid[0] in user_rooms:
                del user_rooms[partner_sid[0]]
            
            del active_chats[room_id]
        
        del user_rooms[sid]
    
    await sio.emit('chat_ended', room=sid)

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

# Helper functions
async def try_match(city: str):
    print(f'[MATCH] try_match called for city: {city}', flush=True)
    print(f'[MATCH] Current queue for {city}: {waiting_queue.get(city, [])}', flush=True)
    
    if city not in waiting_queue or len(waiting_queue[city]) < 2:
        print(f'[MATCH] Not enough users in {city} (need 2, have {len(waiting_queue.get(city, []))})', flush=True)
        # If less than 2 users in this city, try to match with any available user from other cities
        if city in waiting_queue and len(waiting_queue[city]) == 1:
            # Find a user from any other city who's also waiting alone
            for other_city, other_users in waiting_queue.items():
                if other_city != city and len(other_users) >= 1:
                    print(f'[MATCH] Found cross-city match: {city} + {other_city}', flush=True)
                    # Match across cities
                    user1_sid = waiting_queue[city].pop(0)
                    user2_sid = other_users.pop(0)
                    
                    # Clean up empty queues
                    if not waiting_queue[city]:
                        del waiting_queue[city]
                    if not other_users and other_city in waiting_queue:
                        del waiting_queue[other_city]
                    
                    await create_match(user1_sid, user2_sid)
                    return
        return
    
    # Get two users from same city
    print(f'[MATCH] Matching two users from {city}', flush=True)
    user1_sid = waiting_queue[city].pop(0)
    user2_sid = waiting_queue[city].pop(0)
    
    print(f'[MATCH] Popped users: {user1_sid} and {user2_sid}', flush=True)
    
    # Clean up empty queue
    if not waiting_queue[city]:
        del waiting_queue[city]
    
    await create_match(user1_sid, user2_sid)

async def create_match(user1_sid: str, user2_sid: str):
    """Create a match between two users"""
    print(f'[MATCH] Creating match between {user1_sid} and {user2_sid}', flush=True)
    
    # Prevent self-matching
    if user1_sid == user2_sid:
        print(f'[MATCH] ERROR: Cannot match user with themselves!', flush=True)
        return
    
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
    
    print(f'[MATCH] Matched {user1_sid} ({user1_data.get("city", "Unknown")}) and {user2_sid} ({user2_data.get("city", "Unknown")}) in room {room_id}', flush=True)
    logger.info(f'Matched {user1_sid} ({user1_data.get("city", "Unknown")}) and {user2_sid} ({user2_data.get("city", "Unknown")}) in room {room_id}')

async def try_global_match_after_delay(sid: str, delay: int):
    """Try to match user with anyone globally after a delay"""
    await asyncio.sleep(delay)
    
    # Check if user is still waiting
    if sid not in user_rooms:  # Not matched yet
        # Find any other waiting user from any city
        for city, users in list(waiting_queue.items()):
            if sid in users:
                # User is still waiting, try to match with anyone
                for other_city, other_users in list(waiting_queue.items()):
                    if other_users and (other_city != city or len(other_users) > 1):
                        # Found someone, match them
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
                            logger.info(f'Global match: {sid} with {other_sid}')
                            return

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
# Socket.IO will handle requests to /api/socket.io/*
socket_app = socketio.ASGIApp(
    sio,
    other_asgi_app=app,
    socketio_path='/api/socket.io'
)

# Export for uvicorn
app = socket_app
