"""Admin endpoints + check-ip + stats."""
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response

from db import users_collection, reports_collection
from state import (
    active_connections, city_users, active_chats,
    ip_blocks, ip_report_count,
)
from helpers import require_admin

router = APIRouter()


@router.get("/api/check-ip")
async def check_ip_block(request: Request):
    # Use request.client.host (set by nginx/uvicorn) — never trust x-forwarded-for from client
    client_ip = request.client.host

    now = datetime.now(timezone.utc)
    expired = [ip for ip, expires in ip_blocks.items() if expires < now]
    for ip in expired:
        del ip_blocks[ip]
        ip_report_count.pop(ip, None)

    if client_ip in ip_blocks:
        remaining = ip_blocks[client_ip] - now
        hours_remaining = int(remaining.total_seconds() // 3600)
        return {"blocked": True, "hours_remaining": hours_remaining,
                "message": f"You are temporarily blocked. Try again in {hours_remaining} hours."}
    return {"blocked": False}


@router.get("/api/admin/users")
async def admin_list_users(request: Request, limit: int = 100, skip: int = 0):
    if not require_admin(request):
        return Response(status_code=401, content='{"ok": false, "message": "Unauthorized"}', media_type="application/json")
    cursor = users_collection.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(min(limit, 500))
    users = await cursor.to_list(length=limit)
    total = await users_collection.count_documents({})
    return {"ok": True, "total": total, "users": users}


@router.get("/api/admin/reports")
async def admin_list_reports(request: Request, limit: int = 100, skip: int = 0):
    if not require_admin(request):
        return Response(status_code=401, content='{"ok": false, "message": "Unauthorized"}', media_type="application/json")
    cursor = reports_collection.find({}, {"_id": 0, "_created_at": 0}).sort("timestamp", -1).skip(skip).limit(min(limit, 500))
    items = await cursor.to_list(length=limit)
    total = await reports_collection.count_documents({})
    return {"ok": True, "total": total, "reports": items}


@router.get("/api/stats")
async def get_stats():
    online = len(active_connections)
    chats = len(active_chats)
    cities = len(city_users)
    return {"online": online, "active_chats": chats, "cities": cities, "chats_today": chats * 12}
