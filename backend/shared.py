"""
Shared state and utilities for Stumble Chat
This module contains shared data structures used by both server.py and bot.py
to avoid circular imports.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import logging
import asyncio
import uuid
import secrets

logger = logging.getLogger(__name__)

# ============================================
# SHARED IN-MEMORY DATA STRUCTURES
# ============================================

# User and connection management
waiting_queue: Dict[str, List[str]] = {}  # city -> [socket_ids]
active_connections: Dict[str, dict] = {}  # socket_id -> user_data
city_users: Dict[str, int] = {}  # city -> count
active_chats: Dict[str, List[str]] = {}  # room_id -> [socket_id1, socket_id2]
user_rooms: Dict[str, str] = {}  # socket_id -> room_id

# Report & IP blocking system
reports: List[dict] = []  # List of report records
ip_blocks: Dict[str, datetime] = {}  # ip -> block_expires_at
user_ip_map: Dict[str, str] = {}  # socket_id -> ip_address
ip_report_count: Dict[str, int] = {}  # ip -> report_count

# Photo tracking for disappearing photos
photo_messages: Dict[str, dict] = {}  # photo_id -> {sender_sid, receiver_sid, opened, timer_started}

# User sessions (Emergent Google Auth)
user_sessions: Dict[str, dict] = {}  # session_token -> {user_id, email, name, picture, expires_at}
users_db: Dict[str, dict] = {}  # user_id -> {user_id, email, name, picture, created_at}

# ============================================
# CONSTANTS
# ============================================

MAX_RANDOM_USER_ID = 9999
SOCKET_TIMEOUT_MS = 20000
SEARCH_RETRY_INTERVAL_MS = 60000
PHOTO_EXPIRY_SECONDS = 15
IP_BLOCK_DURATION_DAYS = 3
REPORTS_FOR_BLOCK = 3

# ============================================
# UTILITY FUNCTIONS
# ============================================

def generate_user_id() -> str:
    """Generate a secure random user ID."""
    return f"user_{secrets.token_hex(6)}"

def generate_room_id() -> str:
    """Generate a secure random room ID."""
    return secrets.token_hex(16)

def generate_photo_id() -> str:
    """Generate a secure random photo ID."""
    return str(uuid.uuid4())

def is_ip_blocked(ip: str) -> bool:
    """Check if an IP address is currently blocked."""
    if ip not in ip_blocks:
        return False
    
    if ip_blocks[ip] < datetime.now(timezone.utc):
        # Block expired, clean up
        del ip_blocks[ip]
        if ip in ip_report_count:
            del ip_report_count[ip]
        return False
    
    return True

def block_ip(ip: str) -> datetime:
    """Block an IP address for the configured duration."""
    block_until = datetime.now(timezone.utc) + timedelta(days=IP_BLOCK_DURATION_DAYS)
    ip_blocks[ip] = block_until
    return block_until

def increment_report_count(ip: str) -> int:
    """Increment report count for an IP and return new count."""
    ip_report_count[ip] = ip_report_count.get(ip, 0) + 1
    return ip_report_count[ip]

def clean_expired_blocks() -> None:
    """Remove expired IP blocks."""
    now = datetime.now(timezone.utc)
    expired = [ip for ip, expires in ip_blocks.items() if expires < now]
    for ip in expired:
        del ip_blocks[ip]
        if ip in ip_report_count:
            del ip_report_count[ip]
