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


async def init_indexes():
    """Create indexes for fast lookups."""
    await users_collection.create_index('email', unique=True)
    await users_collection.create_index('user_id', unique=True)
    await sessions_collection.create_index('session_token', unique=True)
    await sessions_collection.create_index('expires_at', expireAfterSeconds=0)
    await reports_collection.create_index('timestamp')
    await reports_collection.create_index('reported_ip')
    await otp_collection.create_index('email')
    await otp_collection.create_index('expires_at', expireAfterSeconds=0)
