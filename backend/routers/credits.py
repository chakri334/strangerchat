"""
Credits system for Stumble Chat.

Credits are earned by:
  - Watching a rewarded ad            → +10 credits
  - Completing profile                → +20 credits (one-time)
  - Daily login streak                → +5 credits/day
  - Referring a friend who signs up   → +50 credits

Credits are spent on:
  - Unlocking DM with a specific person (instead of watching ad) → -30 credits

Collections used:
  - credits        : { user_id, balance, last_daily_claim, profile_bonus_claimed, total_earned }
  - dm_unlocks     : { user_a, user_b, unlocked_at, first_reply_at, expires_at }
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from db import credits_collection, dm_unlocks_collection, users_collection, sessions_collection

router = APIRouter(prefix="/api/credits")

# ── Constants ─────────────────────────────────────────────────────────────────
AD_REWARD           = 10   # credits per rewarded ad watch
DAILY_REWARD        = 5    # credits per daily login
PROFILE_BONUS       = 20   # one-time profile completion bonus
REFERRAL_REWARD     = 50   # credits for referring a friend
DM_UNLOCK_COST      = 30   # credits to unlock DM without watching ad

DM_EXPIRY_NO_REPLY  = timedelta(hours=4)   # expires if partner never replies
DM_EXPIRY_REPLIED   = timedelta(hours=2)   # expires 2hrs after first reply


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_user_from_request(request: Request) -> dict:
    """Validate session token from Authorization header and return user dict."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await sessions_collection.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return session


async def get_or_create_credits(user_id: str) -> dict:
    """Return credit doc, creating it if it doesn't exist."""
    doc = await credits_collection.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        doc = {
            "user_id": user_id,
            "balance": 0,
            "total_earned": 0,
            "last_daily_claim": None,
            "profile_bonus_claimed": False,
            "transactions": [],
        }
        await credits_collection.insert_one({**doc})
    return doc


async def _add_credits(user_id: str, amount: int, reason: str):
    """Add credits to a user's balance and log the transaction."""
    now = datetime.now(timezone.utc)
    txn = {"amount": amount, "reason": reason, "ts": now.isoformat()}
    await credits_collection.update_one(
        {"user_id": user_id},
        {
            "$inc": {"balance": amount, "total_earned": amount},
            "$push": {"transactions": {"$each": [txn], "$slice": -50}},  # keep last 50
        },
        upsert=True,
    )


async def _spend_credits(user_id: str, amount: int, reason: str) -> bool:
    """Deduct credits. Returns False if insufficient balance."""
    doc = await get_or_create_credits(user_id)
    if doc["balance"] < amount:
        return False
    now = datetime.now(timezone.utc)
    txn = {"amount": -amount, "reason": reason, "ts": now.isoformat()}
    await credits_collection.update_one(
        {"user_id": user_id},
        {
            "$inc": {"balance": -amount},
            "$push": {"transactions": {"$each": [txn], "$slice": -50}},
        },
    )
    return True


def _dm_unlock_key(user_a: str, user_b: str) -> tuple:
    """Canonical sorted pair for DM unlock lookup."""
    return tuple(sorted([user_a, user_b]))


async def get_dm_unlock(user_a: str, user_b: str) -> dict | None:
    """Return active DM unlock doc between two users, or None if expired/missing."""
    a, b = _dm_unlock_key(user_a, user_b)
    now = datetime.now(timezone.utc)
    doc = await dm_unlocks_collection.find_one(
        {"user_a": a, "user_b": b, "expires_at": {"$gt": now}},
        {"_id": 0},
    )
    return doc


async def create_dm_unlock(user_a: str, user_b: str):
    """Create or refresh a DM unlock between two users (no-reply expiry)."""
    a, b = _dm_unlock_key(user_a, user_b)
    now = datetime.now(timezone.utc)
    expires_at = now + DM_EXPIRY_NO_REPLY
    await dm_unlocks_collection.update_one(
        {"user_a": a, "user_b": b},
        {"$set": {
            "user_a": a, "user_b": b,
            "unlocked_at": now,
            "first_reply_at": None,
            "expires_at": expires_at,
        }},
        upsert=True,
    )


async def record_dm_first_reply(user_a: str, user_b: str):
    """
    Called when the first reply is sent in an unlocked DM.
    Shortens expiry to 2 hours from now.
    """
    a, b = _dm_unlock_key(user_a, user_b)
    now = datetime.now(timezone.utc)
    expires_at = now + DM_EXPIRY_REPLIED
    await dm_unlocks_collection.update_one(
        {"user_a": a, "user_b": b, "first_reply_at": None},
        {"$set": {"first_reply_at": now, "expires_at": expires_at}},
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/balance")
async def get_balance(request: Request):
    """Get current credit balance for the authenticated user."""
    session = await _get_user_from_request(request)
    user_id = session["user_id"]
    doc = await get_or_create_credits(user_id)
    return {
        "ok": True,
        "balance": doc["balance"],
        "total_earned": doc["total_earned"],
    }


@router.post("/claim-daily")
async def claim_daily(request: Request):
    """
    Claim daily login reward (+5 credits).
    Can only be claimed once every 24 hours.
    """
    session = await _get_user_from_request(request)
    user_id = session["user_id"]
    doc = await get_or_create_credits(user_id)

    now = datetime.now(timezone.utc)
    last = doc.get("last_daily_claim")
    if last:
        last_dt = last if isinstance(last, datetime) else datetime.fromisoformat(str(last))
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        if (now - last_dt) < timedelta(hours=24):
            remaining = timedelta(hours=24) - (now - last_dt)
            hours = int(remaining.total_seconds() // 3600)
            mins  = int((remaining.total_seconds() % 3600) // 60)
            return {"ok": False, "message": f"Come back in {hours}h {mins}m", "balance": doc["balance"]}

    await _add_credits(user_id, DAILY_REWARD, "daily_login")
    await credits_collection.update_one(
        {"user_id": user_id},
        {"$set": {"last_daily_claim": now}},
    )
    new_balance = doc["balance"] + DAILY_REWARD
    return {"ok": True, "awarded": DAILY_REWARD, "balance": new_balance, "message": f"+{DAILY_REWARD} credits for daily login!"}


@router.post("/claim-ad-reward")
async def claim_ad_reward(request: Request):
    """
    Award credits after user watches a rewarded ad (+10 credits).
    In production: verify ad completion token from AdMob before awarding.
    """
    session = await _get_user_from_request(request)
    user_id = session["user_id"]
    doc = await get_or_create_credits(user_id)
    await _add_credits(user_id, AD_REWARD, "rewarded_ad")
    return {
        "ok": True,
        "awarded": AD_REWARD,
        "balance": doc["balance"] + AD_REWARD,
        "message": f"+{AD_REWARD} credits for watching the ad!",
    }


@router.post("/claim-profile-bonus")
async def claim_profile_bonus(request: Request):
    """
    One-time bonus for completing profile (+20 credits).
    Requires: name, bio, interests set on user profile.
    """
    session = await _get_user_from_request(request)
    user_id = session["user_id"]
    doc = await get_or_create_credits(user_id)

    if doc.get("profile_bonus_claimed"):
        return {"ok": False, "message": "Profile bonus already claimed.", "balance": doc["balance"]}

    user = await users_collection.find_one({"user_id": user_id}, {"_id": 0, "bio": 1, "interests": 1, "name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    has_bio       = bool(user.get("bio", "").strip())
    has_interests = len(user.get("interests", [])) >= 1
    has_name      = bool(user.get("name", "").strip())

    if not (has_bio and has_interests and has_name):
        missing = []
        if not has_name:       missing.append("name")
        if not has_bio:        missing.append("bio")
        if not has_interests:  missing.append("at least 1 interest")
        return {
            "ok": False,
            "message": f"Complete your profile first: {', '.join(missing)}",
            "balance": doc["balance"],
        }

    await _add_credits(user_id, PROFILE_BONUS, "profile_completion")
    await credits_collection.update_one({"user_id": user_id}, {"$set": {"profile_bonus_claimed": True}})
    return {
        "ok": True,
        "awarded": PROFILE_BONUS,
        "balance": doc["balance"] + PROFILE_BONUS,
        "message": f"+{PROFILE_BONUS} credits for completing your profile!",
    }


class SpendCreditsBody(BaseModel):
    target_user_id: str


@router.post("/unlock-dm")
async def unlock_dm_with_credits(request: Request, body: SpendCreditsBody):
    """
    Spend 30 credits to unlock DM with a specific user (skips ad).
    """
    session = await _get_user_from_request(request)
    user_id = session["user_id"]
    target  = body.target_user_id

    if user_id == target:
        raise HTTPException(status_code=400, detail="Cannot unlock DM with yourself")

    existing = await get_dm_unlock(user_id, target)
    if existing:
        return {"ok": True, "message": "DM already unlocked.", "expires_at": existing["expires_at"].isoformat()}

    spent = await _spend_credits(user_id, DM_UNLOCK_COST, f"dm_unlock:{target}")
    if not spent:
        doc = await get_or_create_credits(user_id)
        return {
            "ok": False,
            "message": f"Not enough credits. You need {DM_UNLOCK_COST}, you have {doc['balance']}.",
            "balance": doc["balance"],
        }

    await create_dm_unlock(user_id, target)
    unlock = await get_dm_unlock(user_id, target)
    return {
        "ok": True,
        "message": "DM unlocked!",
        "expires_at": unlock["expires_at"].isoformat(),
        "balance": (await get_or_create_credits(user_id))["balance"],
    }


@router.get("/dm-status/{target_user_id}")
async def dm_status(request: Request, target_user_id: str):
    """Check if DM is currently unlocked between authenticated user and target."""
    session = await _get_user_from_request(request)
    user_id = session["user_id"]
    unlock  = await get_dm_unlock(user_id, target_user_id)
    if not unlock:
        return {"ok": True, "unlocked": False}
    return {
        "ok": True,
        "unlocked": True,
        "expires_at": unlock["expires_at"].isoformat(),
        "first_reply_at": unlock["first_reply_at"].isoformat() if unlock.get("first_reply_at") else None,
    }


@router.get("/how-to-earn")
async def how_to_earn():
    """
    Public endpoint — explains how users can earn credits.
    Shown in the ad placeholder UI.
    """
    return {
        "ok": True,
        "ways_to_earn": [
            {"action": "Watch a short ad",        "credits": AD_REWARD,     "repeatable": True},
            {"action": "Daily login",              "credits": DAILY_REWARD,  "repeatable": True,  "note": "Once every 24 hours"},
            {"action": "Complete your profile",    "credits": PROFILE_BONUS, "repeatable": False, "note": "One-time bonus"},
            {"action": "Refer a friend",           "credits": REFERRAL_REWARD, "repeatable": True, "note": "Per successful referral"},
        ],
        "ways_to_spend": [
            {"action": "Unlock Direct Message",    "credits": DM_UNLOCK_COST, "note": "Skip the ad, unlock DM instantly"},
        ],
    }
