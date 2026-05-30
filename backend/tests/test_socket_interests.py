"""
Socket.IO test: register_user accepts interests + interested_in + bio,
and they appear in /api/active-users. Also verifies interests filter.
"""
import os
import time
import asyncio
import requests
import socketio
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


@pytest.mark.asyncio
async def test_register_user_interests_visible_in_active_users():
    sio = socketio.AsyncClient(reconnection=False)
    await sio.connect(BASE_URL, transports=['polling'], socketio_path='/api/socket.io')

    registered = asyncio.Event()

    @sio.on('registered')
    def on_registered(data):
        registered.set()

    await sio.emit('register_user', {
        'name': 'TEST_InterestsUser',
        'age': '25',
        'gender': 'female',
        'city': 'TestCity',
        'interests': ['MUSIC', 'Gaming', 'travel'],
        'interested_in': 'both',
        'bio': 'I am a test bio',
    })

    try:
        await asyncio.wait_for(registered.wait(), timeout=5)
    finally:
        # Give the server a brief moment, then check active-users
        await asyncio.sleep(0.5)

    # Now call /api/active-users — our user should be there with new fields
    r = requests.get(f"{BASE_URL}/api/active-users")
    assert r.status_code == 200
    users = r.json()["users"]
    me = [u for u in users if u.get("name") == "TEST_InterestsUser"]
    assert len(me) >= 1, f"User not present in active-users: {users}"
    u = me[0]
    assert "music" in [t.lower() for t in u["interests"]] or "MUSIC" in u["interests"]
    assert u["interested_in"] == "both"
    assert u["bio"] == "I am a test bio"

    # interests filter — request with tag 'gaming' should include us
    r2 = requests.get(f"{BASE_URL}/api/active-users",
                      params={"interests": "gaming"})
    assert r2.status_code == 200
    names = [u["name"] for u in r2.json()["users"]]
    assert "TEST_InterestsUser" in names

    # filter with non-matching tag — should NOT include us
    r3 = requests.get(f"{BASE_URL}/api/active-users",
                      params={"interests": "nonexistent_tag_xyz"})
    assert r3.status_code == 200
    names3 = [u["name"] for u in r3.json()["users"]]
    assert "TEST_InterestsUser" not in names3

    await sio.disconnect()


@pytest.mark.asyncio
async def test_random_chat_two_users_match():
    """End-to-end: two users register and join queue → both get match_found."""
    sio1 = socketio.AsyncClient(reconnection=False)
    sio2 = socketio.AsyncClient(reconnection=False)
    matched1 = asyncio.Event()
    matched2 = asyncio.Event()

    @sio1.on('match_found')
    def m1(data):
        matched1.set()

    @sio2.on('match_found')
    def m2(data):
        matched2.set()

    await sio1.connect(BASE_URL, transports=['polling'], socketio_path='/api/socket.io')
    await sio2.connect(BASE_URL, transports=['polling'], socketio_path='/api/socket.io')

    await sio1.emit('register_user', {'name': 'TEST_M1', 'city': 'MatchCity'})
    await sio2.emit('register_user', {'name': 'TEST_M2', 'city': 'MatchCity'})
    await asyncio.sleep(0.5)

    await sio1.emit('join_queue', {'city': 'MatchCity'})
    await sio2.emit('join_queue', {'city': 'MatchCity'})

    try:
        await asyncio.wait_for(asyncio.gather(matched1.wait(), matched2.wait()), timeout=10)
    finally:
        await sio1.disconnect()
        await sio2.disconnect()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
