"""
Test script to simulate 5 users connecting and matching.
Tests connection stability and matchmaking logic.
"""
import asyncio
import socketio
import time
from datetime import datetime

BACKEND_URL = "https://socket-io-staging.preview.emergentagent.com"

class TestUser:
    def __init__(self, user_id: int):
        self.user_id = user_id
        self.name = f"TestUser{user_id}"
        self.sio = socketio.AsyncClient(logger=False, engineio_logger=False)
        self.connected = False
        self.registered = False
        self.matched = False
        self.partner = None
        self.room_id = None
        self.messages_sent = []
        self.messages_received = []
        self.disconnected_by_partner = False
        self.connect_time = None
        self.match_time = None
        
    async def connect(self):
        """Connect to the server"""
        
        @self.sio.event
        async def connect():
            self.connected = True
            self.connect_time = datetime.now()
            print(f"[User {self.user_id}] Connected at {self.connect_time.strftime('%H:%M:%S.%f')[:-3]}")
            
        @self.sio.event
        async def disconnect():
            self.connected = False
            print(f"[User {self.user_id}] Disconnected")
            
        @self.sio.on('registered')
        async def on_registered(data):
            self.registered = True
            print(f"[User {self.user_id}] Registered successfully")
            
        @self.sio.on('match_found')
        async def on_match_found(data):
            self.matched = True
            self.partner = data.get('partner', {})
            self.room_id = data.get('room_id')
            self.match_time = datetime.now()
            match_delay = (self.match_time - self.connect_time).total_seconds() if self.connect_time else 0
            print(f"[User {self.user_id}] MATCHED with {self.partner.get('name')} in room {self.room_id[:8]}... (took {match_delay:.2f}s)")
            
        @self.sio.on('new_message')
        async def on_message(data):
            self.messages_received.append(data)
            print(f"[User {self.user_id}] Received message: {data.get('message')}")
            
        @self.sio.on('partner_disconnected')
        async def on_partner_disconnected():
            self.disconnected_by_partner = True
            print(f"[User {self.user_id}] Partner disconnected")
            
        @self.sio.on('chat_ended')
        async def on_chat_ended():
            print(f"[User {self.user_id}] Chat ended")
        
        try:
            await self.sio.connect(
                BACKEND_URL,
                socketio_path='/api/socket.io',
                transports=['polling']
            )
            return True
        except Exception as e:
            print(f"[User {self.user_id}] Connection failed: {e}")
            return False
    
    async def register(self):
        """Register with the server"""
        await self.sio.emit('register_user', {
            'name': self.name,
            'age': '25',
            'gender': 'other',
            'city': 'Global'
        })
        await asyncio.sleep(0.5)
        return self.registered
        
    async def join_queue(self):
        """Join the matchmaking queue"""
        print(f"[User {self.user_id}] Joining queue...")
        await self.sio.emit('join_queue', {'city': 'Global'})
        
    async def send_message(self, message: str):
        """Send a message"""
        await self.sio.emit('send_message', {'message': message})
        self.messages_sent.append(message)
        print(f"[User {self.user_id}] Sent: {message}")
        
    async def skip(self):
        """Skip current chat"""
        await self.sio.emit('skip_chat', {})
        print(f"[User {self.user_id}] Skipped chat")
        
    async def disconnect_chat(self):
        """Disconnect from chat"""
        await self.sio.emit('disconnect_chat', {'notify': True})
        print(f"[User {self.user_id}] Disconnected chat")
        
    async def close(self):
        """Close the socket connection"""
        if self.sio.connected:
            await self.sio.disconnect()


async def run_5_user_test():
    """Run test with 5 users"""
    print("=" * 60)
    print("STUMBLE CHAT - 5 USER MATCHING TEST")
    print("=" * 60)
    print()
    
    users = [TestUser(i) for i in range(1, 6)]
    results = {
        'connections': 0,
        'registrations': 0,
        'matches': [],
        'messages_delivered': 0,
        'connection_stable': True,
        'errors': []
    }
    
    # Phase 1: Connect all users
    print("PHASE 1: Connecting 5 users...")
    print("-" * 40)
    
    connect_tasks = [user.connect() for user in users]
    connect_results = await asyncio.gather(*connect_tasks)
    
    await asyncio.sleep(1)  # Wait for connections to stabilize
    
    for i, success in enumerate(connect_results):
        if success and users[i].connected:
            results['connections'] += 1
        else:
            results['errors'].append(f"User {i+1} failed to connect")
    
    print(f"\nConnections: {results['connections']}/5")
    
    # Phase 2: Register all users
    print("\nPHASE 2: Registering users...")
    print("-" * 40)
    
    register_tasks = [user.register() for user in users if user.connected]
    await asyncio.gather(*register_tasks)
    
    await asyncio.sleep(1)
    
    for user in users:
        if user.registered:
            results['registrations'] += 1
    
    print(f"\nRegistrations: {results['registrations']}/5")
    
    # Phase 3: Join queue and match
    print("\nPHASE 3: Joining queue and matching...")
    print("-" * 40)
    
    # Join queue in sequence to see matching happen
    for user in users:
        if user.registered and not user.matched:
            await user.join_queue()
            await asyncio.sleep(0.3)  # Small delay between joins
    
    # Wait for matches
    print("\nWaiting for matches (max 10 seconds)...")
    for _ in range(20):  # 10 seconds max
        await asyncio.sleep(0.5)
        matched_count = sum(1 for u in users if u.matched)
        if matched_count >= 4:  # 4 users matched (2 pairs), 1 waiting
            break
    
    # Count matches
    matched_users = [u for u in users if u.matched]
    unmatched_users = [u for u in users if not u.matched and u.registered]
    
    print(f"\nMatched users: {len(matched_users)}/5")
    print(f"Unmatched users: {len(unmatched_users)}/5")
    
    # Identify pairs
    pairs = {}
    for user in matched_users:
        if user.room_id and user.room_id not in pairs:
            pairs[user.room_id] = []
        if user.room_id:
            pairs[user.room_id].append(user.name)
    
    print(f"\nMatch pairs formed: {len(pairs)}")
    for room_id, pair_users in pairs.items():
        print(f"  Room {room_id[:8]}...: {' <-> '.join(pair_users)}")
        results['matches'].append(pair_users)
    
    # Phase 4: Test messaging between matched users
    print("\nPHASE 4: Testing message delivery...")
    print("-" * 40)
    
    if len(matched_users) >= 2:
        # Get first matched pair
        test_user1 = matched_users[0]
        test_user2 = None
        for u in matched_users[1:]:
            if u.room_id == test_user1.room_id:
                test_user2 = u
                break
        
        if test_user2:
            # User 1 sends message to User 2
            await test_user1.send_message("Hello from User 1!")
            await asyncio.sleep(1)
            
            # Check if User 2 received it
            if test_user2.messages_received:
                print(f"  [User {test_user2.user_id}] received: {test_user2.messages_received[-1].get('message')}")
                results['messages_delivered'] += 1
            
            # User 2 sends message back
            await test_user2.send_message("Hi back from User 2!")
            await asyncio.sleep(1)
            
            # Check if User 1 received it
            if test_user1.messages_received:
                print(f"  [User {test_user1.user_id}] received: {test_user1.messages_received[-1].get('message')}")
                results['messages_delivered'] += 1
    
    # Phase 5: Test connection stability (keep connected for 5 seconds)
    print("\nPHASE 5: Testing connection stability (5 seconds)...")
    print("-" * 40)
    
    await asyncio.sleep(5)
    
    still_connected = sum(1 for u in users if u.connected)
    print(f"Users still connected after 5s: {still_connected}/5")
    
    if still_connected < results['connections']:
        results['connection_stable'] = False
        results['errors'].append(f"Connection dropped: {results['connections'] - still_connected} users disconnected")
    
    # Phase 6: Test skip functionality
    print("\nPHASE 6: Testing skip...")
    print("-" * 40)
    
    if len(matched_users) >= 2:
        skipper = matched_users[0]
        partner = None
        for u in matched_users[1:]:
            if u.room_id == skipper.room_id:
                partner = u
                break
        
        if partner:
            await skipper.skip()
            await asyncio.sleep(1)
            
            if partner.disconnected_by_partner:
                print(f"  Skip successful - {partner.name} notified of partner skip")
    
    # Cleanup
    print("\nCleaning up...")
    for user in users:
        await user.close()
    
    # Final Report
    print("\n" + "=" * 60)
    print("TEST REPORT")
    print("=" * 60)
    print(f"Connections successful:     {results['connections']}/5")
    print(f"Registrations successful:   {results['registrations']}/5")
    print(f"Matches formed:             {len(results['matches'])} pairs")
    print(f"Messages delivered:         {results['messages_delivered']}/2")
    print(f"Connection stable:          {'Yes' if results['connection_stable'] else 'No'}")
    
    if results['errors']:
        print(f"\nErrors:")
        for error in results['errors']:
            print(f"  - {error}")
    
    # Overall status
    success = (
        results['connections'] == 5 and
        results['registrations'] == 5 and
        len(results['matches']) >= 2 and
        results['messages_delivered'] == 2 and
        results['connection_stable']
    )
    
    print(f"\n{'=' * 60}")
    print(f"OVERALL STATUS: {'PASSED' if success else 'NEEDS ATTENTION'}")
    print(f"{'=' * 60}")
    
    return results


if __name__ == "__main__":
    asyncio.run(run_5_user_test())
