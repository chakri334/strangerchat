"""
Comprehensive test for Stumble Chat messaging and photo sharing.
Tests 100 messages and 5 images between two matched users.
"""
import asyncio
import socketio
import base64
import time
from datetime import datetime
import os

BACKEND_URL = "https://socket-io-staging.preview.emergentagent.com"

# Create a simple test image (1x1 red pixel PNG)
TEST_IMAGE_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="


class ChatUser:
    def __init__(self, name: str):
        self.name = name
        self.sio = socketio.AsyncClient(logger=False, engineio_logger=False)
        self.connected = False
        self.registered = False
        self.matched = False
        self.partner = None
        self.room_id = None
        self.messages_received = []
        self.photos_received = []
        self.photos_sent_confirmed = []
        self.disconnected = False
        
    async def setup_listeners(self):
        @self.sio.event
        async def connect():
            self.connected = True
            print(f"[{self.name}] Connected to server")
            
        @self.sio.event
        async def disconnect():
            self.connected = False
            self.disconnected = True
            print(f"[{self.name}] Disconnected from server")
            
        @self.sio.on('registered')
        async def on_registered(data):
            self.registered = True
            print(f"[{self.name}] Registered successfully")
            
        @self.sio.on('match_found')
        async def on_match_found(data):
            self.matched = True
            self.partner = data.get('partner', {})
            self.room_id = data.get('room_id')
            print(f"[{self.name}] MATCHED with {self.partner.get('name')}")
            
        @self.sio.on('new_message')
        async def on_message(data):
            self.messages_received.append({
                'message': data.get('message'),
                'timestamp': data.get('timestamp'),
                'received_at': datetime.now()
            })
            
        @self.sio.on('new_photo')
        async def on_photo(data):
            self.photos_received.append({
                'photo_id': data.get('photo_id'),
                'has_photo_data': bool(data.get('photo')),
                'received_at': datetime.now()
            })
            print(f"[{self.name}] Received photo {data.get('photo_id')[:8]}...")
            
        @self.sio.on('photo_sent')
        async def on_photo_sent(data):
            self.photos_sent_confirmed.append({
                'photo_id': data.get('photo_id'),
                'confirmed_at': datetime.now()
            })
            print(f"[{self.name}] Photo sent confirmed {data.get('photo_id')[:8]}...")
            
        @self.sio.on('partner_disconnected')
        async def on_partner_disconnected():
            print(f"[{self.name}] Partner disconnected")
            
    async def connect(self):
        await self.setup_listeners()
        try:
            await self.sio.connect(
                BACKEND_URL,
                socketio_path='/api/socket.io',
                transports=['polling'],
                wait_timeout=10
            )
            await asyncio.sleep(0.5)
            return self.connected
        except Exception as e:
            print(f"[{self.name}] Connection failed: {e}")
            return False
    
    async def register(self):
        await self.sio.emit('register_user', {
            'name': self.name,
            'age': '25',
            'gender': 'other',
            'city': 'Global'
        })
        await asyncio.sleep(0.5)
        return self.registered
        
    async def join_queue(self):
        await self.sio.emit('join_queue', {'city': 'Global'})
        
    async def send_message(self, message: str):
        await self.sio.emit('send_message', {'message': message})
        
    async def send_photo(self):
        await self.sio.emit('send_photo', {'photo': TEST_IMAGE_BASE64})
        
    async def close(self):
        if self.sio.connected:
            await self.sio.disconnect()


async def run_messaging_test():
    """Test 100 messages and 5 photos between two users"""
    print("=" * 70)
    print("STUMBLE CHAT - MESSAGING & PHOTO TEST")
    print("Testing: 100 messages + 5 photos from each user")
    print("=" * 70)
    print()
    
    user1 = ChatUser("Alice")
    user2 = ChatUser("Bob")
    
    results = {
        'user1_messages_sent': 0,
        'user1_messages_received': 0,
        'user2_messages_sent': 0,
        'user2_messages_received': 0,
        'user1_photos_sent': 0,
        'user1_photos_received': 0,
        'user2_photos_sent': 0,
        'user2_photos_received': 0,
        'errors': []
    }
    
    try:
        # Step 1: Connect both users
        print("STEP 1: Connecting users...")
        print("-" * 50)
        
        conn1 = await user1.connect()
        conn2 = await user2.connect()
        
        if not conn1 or not conn2:
            results['errors'].append("Failed to connect users")
            print("ERROR: Connection failed")
            return results
            
        print(f"  Alice connected: {conn1}")
        print(f"  Bob connected: {conn2}")
        
        # Step 2: Register both users
        print("\nSTEP 2: Registering users...")
        print("-" * 50)
        
        reg1 = await user1.register()
        reg2 = await user2.register()
        
        print(f"  Alice registered: {reg1}")
        print(f"  Bob registered: {reg2}")
        
        if not reg1 or not reg2:
            results['errors'].append("Failed to register users")
            return results
        
        # Step 3: Join queue and match
        print("\nSTEP 3: Matching users...")
        print("-" * 50)
        
        await user1.join_queue()
        await asyncio.sleep(0.3)
        await user2.join_queue()
        
        # Wait for match
        for _ in range(20):
            await asyncio.sleep(0.5)
            if user1.matched and user2.matched:
                break
        
        if not user1.matched or not user2.matched:
            results['errors'].append("Users failed to match")
            print("ERROR: Matching failed")
            return results
            
        print(f"  Alice matched: {user1.matched}")
        print(f"  Bob matched: {user2.matched}")
        print(f"  Room: {user1.room_id[:16]}...")
        
        # Step 4: Send 100 messages (50 from each user)
        print("\nSTEP 4: Sending 100 messages (50 each)...")
        print("-" * 50)
        
        # Send messages alternating between users
        for i in range(50):
            # User 1 sends
            msg1 = f"Message {i*2 + 1} from Alice"
            await user1.send_message(msg1)
            results['user1_messages_sent'] += 1
            
            # User 2 sends
            msg2 = f"Message {i*2 + 2} from Bob"
            await user2.send_message(msg2)
            results['user2_messages_sent'] += 1
            
            # Small delay to allow processing
            if (i + 1) % 10 == 0:
                await asyncio.sleep(0.2)
                print(f"  Sent {(i+1) * 2} messages...")
        
        # Wait for messages to be delivered
        print("  Waiting for delivery...")
        await asyncio.sleep(3)
        
        results['user1_messages_received'] = len(user1.messages_received)
        results['user2_messages_received'] = len(user2.messages_received)
        
        print(f"\n  Alice received: {results['user1_messages_received']}/50 messages")
        print(f"  Bob received: {results['user2_messages_received']}/50 messages")
        
        # Step 5: Send 5 photos from each user
        print("\nSTEP 5: Sending 10 photos (5 each)...")
        print("-" * 50)
        
        for i in range(5):
            # User 1 sends photo
            await user1.send_photo()
            results['user1_photos_sent'] += 1
            await asyncio.sleep(0.5)
            
            # User 2 sends photo
            await user2.send_photo()
            results['user2_photos_sent'] += 1
            await asyncio.sleep(0.5)
            
            print(f"  Sent {(i+1) * 2} photos...")
        
        # Wait for photos to be processed
        print("  Waiting for delivery...")
        await asyncio.sleep(3)
        
        results['user1_photos_received'] = len(user1.photos_received)
        results['user2_photos_received'] = len(user2.photos_received)
        
        print(f"\n  Alice received: {results['user1_photos_received']}/5 photos")
        print(f"  Bob received: {results['user2_photos_received']}/5 photos")
        print(f"  Alice confirmed sent: {len(user1.photos_sent_confirmed)}/5 photos")
        print(f"  Bob confirmed sent: {len(user2.photos_sent_confirmed)}/5 photos")
        
        # Step 6: Verify connection still stable
        print("\nSTEP 6: Verifying connection stability...")
        print("-" * 50)
        
        await asyncio.sleep(2)
        
        print(f"  Alice still connected: {user1.connected and not user1.disconnected}")
        print(f"  Bob still connected: {user2.connected and not user2.disconnected}")
        
    except Exception as e:
        results['errors'].append(f"Exception: {str(e)}")
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Cleanup
        print("\nCleaning up...")
        await user1.close()
        await user2.close()
    
    # Final Report
    print("\n" + "=" * 70)
    print("TEST RESULTS")
    print("=" * 70)
    
    msg_success_rate = 0
    if results['user1_messages_sent'] + results['user2_messages_sent'] > 0:
        total_sent = results['user1_messages_sent'] + results['user2_messages_sent']
        total_received = results['user1_messages_received'] + results['user2_messages_received']
        msg_success_rate = (total_received / total_sent) * 100
    
    photo_success_rate = 0
    if results['user1_photos_sent'] + results['user2_photos_sent'] > 0:
        total_photos_sent = results['user1_photos_sent'] + results['user2_photos_sent']
        total_photos_received = results['user1_photos_received'] + results['user2_photos_received']
        photo_success_rate = (total_photos_received / total_photos_sent) * 100
    
    print(f"""
MESSAGES:
  - User 1 (Alice) sent:      {results['user1_messages_sent']}
  - User 2 (Bob) received:    {results['user2_messages_received']}
  - User 2 (Bob) sent:        {results['user2_messages_sent']}
  - User 1 (Alice) received:  {results['user1_messages_received']}
  - Delivery rate:            {msg_success_rate:.1f}%

PHOTOS:
  - User 1 (Alice) sent:      {results['user1_photos_sent']}
  - User 2 (Bob) received:    {results['user2_photos_received']}
  - User 2 (Bob) sent:        {results['user2_photos_sent']}
  - User 1 (Alice) received:  {results['user1_photos_received']}
  - Delivery rate:            {photo_success_rate:.1f}%
""")
    
    if results['errors']:
        print("ERRORS:")
        for error in results['errors']:
            print(f"  - {error}")
    
    # Overall status
    success = (
        msg_success_rate >= 95 and
        photo_success_rate >= 95 and
        len(results['errors']) == 0
    )
    
    print("=" * 70)
    print(f"OVERALL STATUS: {'PASSED' if success else 'FAILED'}")
    print("=" * 70)
    
    return results


if __name__ == "__main__":
    asyncio.run(run_messaging_test())
