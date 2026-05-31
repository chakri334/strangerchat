"""MongoDB connection and helpers for StumbleChat."""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Collections
users_collection = db['users']
reports_collection = db['reports']
sessions_collection = db['sessions']
otp_collection = db['email_otps']
messages_collection = db['messages']  # persisted People-tab chats


def conv_id_for(user_a: str, user_b: str) -> str:
    """Deterministic conversation id for an unordered pair of user_ids."""
    a, b = sorted([user_a, user_b])
    return f"{a}__{b}"


async def init_indexes():
    """Create indexes for fast lookups."""
    await users_collection.create_index('email', unique=True)
    await users_collection.create_index('user_id', unique=True)
    await users_collection.create_index('stumble_id', unique=True, sparse=True)
    await sessions_collection.create_index('session_token', unique=True)
    await sessions_collection.create_index('expires_at', expireAfterSeconds=0)
    await reports_collection.create_index('timestamp')
    await reports_collection.create_index('reported_ip')
    await otp_collection.create_index('email')
    await otp_collection.create_index('expires_at', expireAfterSeconds=0)

    # Persistent chat messages
    await messages_collection.create_index('conv_id')
    await messages_collection.create_index([('conv_id', 1), ('created_at', -1)])
    await messages_collection.create_index('message_id', unique=True)
    # All chats expire next Monday 00:00 UTC (set on each insert; see routers/conversations.next_monday_utc).
    # Legacy pinned messages without `expires_at` are backfilled on app startup.
    await messages_collection.create_index('expires_at', expireAfterSeconds=0)
