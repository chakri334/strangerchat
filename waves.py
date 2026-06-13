"""
Wave system for Stumble Chat.

Flow:
  1. User A taps "Wave" on User B's card in People tab
     → POST /api/waves/send   { to_user_id }
     → Wave stored in DB, User B gets socket event 'wave_received'

  2. User B taps "Wave Back"
     → POST /api/waves/respond  { wave_id, accept: true }
     → Both users get socket event 'wave_matched'
     → Frontend shows ad placeholder / spend-credits modal

  3. After ad watched or credits spent (via /api/credits/unlock-dm or /api/credits/claim-ad-reward)
     → DM unlock created for the pair (4hr / 2hr expiry rules apply)
     → Both users get socket event 'dm_unlocked'

Wave expiry: 24 hours (auto-deleted by MongoDB TTL index)
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from db import waves_collection, sessions_collection, users_collection
from state import sio, active_connections

router = APIRouter(prefix="/api/waves")

WAVE_EXPIRY = timedelta(hours=24)

# sid lookup: user_id → socket sid (populated from active_connections)
def _sid_for_user(user_id: str) -> str | None:
    for sid, data in active_connections.items():
        if data.get("user_id") == user_id:
            return sid
    return None


async def _get_user_from_request(request: Request) -> dict:
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await sessions_collection.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return session


# ── Models ────────────────────────────────────────────────────────────────────

class SendWaveBody(BaseModel):
    to_user_id: str

class RespondWaveBody(BaseModel):
    wave_id: str
    accept: bool


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_wave(request: Request, body: SendWaveBody):
    """Send a wave to another user."""
    session = await _get_user_from_request(request)
    from_user_id = session["user_id"]
    to_user_id   = body.to_user_id

    if from_user_id == to_user_id:
        raise HTTPException(status_code=400, detail="Cannot wave at yourself")

    # Check target user exists
    target = await users_collection.find_one({"user_id": to_user_id}, {"_id": 0, "name": 1, "stumble_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for existing pending wave in either direction
    now = datetime.now(timezone.utc)
    existing = await waves_collection.find_one({
        "$or": [
            {"from_user_id": from_user_id, "to_user_id": to_user_id},
            {"from_user_id": to_user_id,   "to_user_id": from_user_id},
        ],
        "status": "pending",
        "expires_at": {"$gt": now},
    }, {"_id": 0})

    if existing:
        # If the other person already waved at us → auto-accept (mutual wave)
        if existing["from_user_id"] == to_user_id:
            wave_id = existing["wave_id"]
            await waves_collection.update_one(
                {"wave_id": wave_id},
                {"$set": {"status": "matched", "matched_at": now}},
            )
            await _notify_wave_matched(from_user_id, to_user_id, wave_id)
            return {"ok": True, "status": "matched", "wave_id": wave_id, "message": "Mutual wave! DM unlocked."}
        return {"ok": False, "message": "You already waved at this person."}

    import uuid
    wave_id = str(uuid.uuid4())
    wave_doc = {
        "wave_id":      wave_id,
        "from_user_id": from_user_id,
        "to_user_id":   to_user_id,
        "from_name":    session.get("name", "Someone"),
        "status":       "pending",
        "created_at":   now,
        "expires_at":   now + WAVE_EXPIRY,
    }
    await waves_collection.insert_one(wave_doc)

    # Notify recipient via socket if they're online
    recipient_sid = _sid_for_user(to_user_id)
    if recipient_sid:
        await sio.emit("wave_received", {
            "wave_id":      wave_id,
            "from_user_id": from_user_id,
            "from_name":    session.get("name", "Someone"),
            "message":      f"{session.get('name', 'Someone')} waved at you! Wave back to unlock DM 👋",
        }, room=recipient_sid)

    return {"ok": True, "status": "pending", "wave_id": wave_id, "message": f"Wave sent to {target['name']}!"}


@router.post("/respond")
async def respond_wave(request: Request, body: RespondWaveBody):
    """Accept or decline a wave."""
    session = await _get_user_from_request(request)
    user_id = session["user_id"]

    now  = datetime.now(timezone.utc)
    wave = await waves_collection.find_one({
        "wave_id": body.wave_id, "to_user_id": user_id,
        "status": "pending", "expires_at": {"$gt": now},
    }, {"_id": 0})

    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found or expired")

    if not body.accept:
        await waves_collection.update_one(
            {"wave_id": body.wave_id},
            {"$set": {"status": "declined"}},
        )
        return {"ok": True, "status": "declined"}

    # Accept → matched
    await waves_collection.update_one(
        {"wave_id": body.wave_id},
        {"$set": {"status": "matched", "matched_at": now}},
    )
    await _notify_wave_matched(wave["from_user_id"], user_id, body.wave_id)
    return {"ok": True, "status": "matched", "wave_id": body.wave_id, "message": "Mutual wave! Watch a short ad to unlock DM."}


@router.get("/pending")
async def get_pending_waves(request: Request):
    """Get all pending waves received by the authenticated user."""
    session = await _get_user_from_request(request)
    user_id = session["user_id"]
    now     = datetime.now(timezone.utc)

    cursor = waves_collection.find(
        {"to_user_id": user_id, "status": "pending", "expires_at": {"$gt": now}},
        {"_id": 0, "wave_id": 1, "from_user_id": 1, "from_name": 1, "created_at": 1},
    )
    waves = await cursor.to_list(length=50)
    return {"ok": True, "waves": waves}


# ── Internal helper ───────────────────────────────────────────────────────────

async def _notify_wave_matched(user_a_id: str, user_b_id: str, wave_id: str):
    """
    Notify both users via socket that their wave was mutual.
    Frontend shows the ad placeholder / spend-credits modal.
    """
    sid_a = _sid_for_user(user_a_id)
    sid_b = _sid_for_user(user_b_id)

    payload = {
        "wave_id":    wave_id,
        "user_a_id":  user_a_id,
        "user_b_id":  user_b_id,
        "message":    "Mutual wave! Watch a short ad or spend 30 credits to unlock Direct Message.",
        "dm_cost_credits": 30,
    }

    if sid_a:
        await sio.emit("wave_matched", {**payload, "partner_id": user_b_id}, room=sid_a)
    if sid_b:
        await sio.emit("wave_matched", {**payload, "partner_id": user_a_id}, room=sid_b)
