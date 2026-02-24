"""
Socket.IO Real-time Chat Testing
Tests Socket.IO events for the Stumble Chat application.
"""
import asyncio
import socketio
import sys

BASE_URL = "https://socket-io-staging.preview.emergentagent.com"
SOCKET_PATH = "/api/socket.io"

async def test_socketio_connection():
    """Test Socket.IO connection and registration"""
    print("\n=== Testing Socket.IO Connection ===")
    
    # Create Socket.IO client with polling transport
    sio = socketio.AsyncClient(
        reconnection=True,
        reconnection_attempts=3,
        reconnection_delay=1,
        logger=False,
        engineio_logger=False
    )
    
    connected = False
    registered = False
    stats_received = False
    
    @sio.event
    async def connect():
        nonlocal connected
        connected = True
        print("✓ Connected to Socket.IO server!")
    
    @sio.event
    async def disconnect():
        print("Disconnected from server")
    
    @sio.on('registered')
    async def on_registered(data):
        nonlocal registered
        registered = True
        print(f"✓ User registered successfully: {data}")
    
    @sio.on('stats_update')
    async def on_stats_update(data):
        nonlocal stats_received
        stats_received = True
        print(f"✓ Stats update received: {data}")
    
    @sio.on('blocked')
    async def on_blocked(data):
        print(f"! User is blocked: {data}")
    
    try:
        # Connect to server
        print(f"Connecting to {BASE_URL}...")
        await sio.connect(
            BASE_URL,
            socketio_path=SOCKET_PATH,
            transports=['polling']
        )
        
        await asyncio.sleep(2)  # Wait for connection
        
        if connected:
            # Register user
            print("Registering user...")
            await sio.emit('register_user', {
                'name': 'TEST_User1',
                'age': '25',
                'gender': 'other',
                'city': 'Global'
            })
            
            await asyncio.sleep(2)  # Wait for registration
            
            # Results
            print("\n=== Test Results ===")
            print(f"Connected: {connected}")
            print(f"Registered: {registered}")
            print(f"Stats Received: {stats_received}")
            
            if connected and registered:
                print("\n✓ Socket.IO connection and registration PASSED!")
                return True
            else:
                print("\n✗ Socket.IO test FAILED - registration issue")
                return False
        else:
            print("\n✗ Socket.IO connection FAILED!")
            return False
            
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        return False
    finally:
        if sio.connected:
            await sio.disconnect()


async def test_two_users_matching():
    """Test two users connecting and getting matched"""
    print("\n=== Testing Two Users Matching ===")
    
    # Create two Socket.IO clients
    sio1 = socketio.AsyncClient(logger=False, engineio_logger=False)
    sio2 = socketio.AsyncClient(logger=False, engineio_logger=False)
    
    user1_matched = False
    user2_matched = False
    user1_partner = None
    user2_partner = None
    
    @sio1.on('registered')
    async def on_registered_1(data):
        print("✓ User 1 registered")
    
    @sio2.on('registered')
    async def on_registered_2(data):
        print("✓ User 2 registered")
    
    @sio1.on('match_found')
    async def on_match_1(data):
        nonlocal user1_matched, user1_partner
        user1_matched = True
        user1_partner = data.get('partner', {})
        print(f"✓ User 1 matched! Partner: {user1_partner}")
    
    @sio2.on('match_found')
    async def on_match_2(data):
        nonlocal user2_matched, user2_partner
        user2_matched = True
        user2_partner = data.get('partner', {})
        print(f"✓ User 2 matched! Partner: {user2_partner}")
    
    try:
        # Connect both users
        print("Connecting User 1...")
        await sio1.connect(BASE_URL, socketio_path=SOCKET_PATH, transports=['polling'])
        await asyncio.sleep(1)
        
        print("Connecting User 2...")
        await sio2.connect(BASE_URL, socketio_path=SOCKET_PATH, transports=['polling'])
        await asyncio.sleep(1)
        
        # Register both users
        print("Registering User 1...")
        await sio1.emit('register_user', {
            'name': 'TEST_MatchUser1',
            'age': '25',
            'gender': 'other',
            'city': 'TestCity'
        })
        await asyncio.sleep(1)
        
        print("Registering User 2...")
        await sio2.emit('register_user', {
            'name': 'TEST_MatchUser2',
            'age': '30',
            'gender': 'other',
            'city': 'TestCity'
        })
        await asyncio.sleep(1)
        
        # Both join queue
        print("User 1 joining queue...")
        await sio1.emit('join_queue', {'city': 'TestCity'})
        await asyncio.sleep(1)
        
        print("User 2 joining queue...")
        await sio2.emit('join_queue', {'city': 'TestCity'})
        await asyncio.sleep(3)  # Wait for matching
        
        # Results
        print("\n=== Matching Results ===")
        print(f"User 1 matched: {user1_matched}")
        print(f"User 2 matched: {user2_matched}")
        
        if user1_matched and user2_matched:
            print("\n✓ Two users matching PASSED!")
            return True
        else:
            print("\n✗ Matching FAILED - users not matched")
            return False
            
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        return False
    finally:
        if sio1.connected:
            await sio1.disconnect()
        if sio2.connected:
            await sio2.disconnect()


async def test_message_exchange():
    """Test message exchange between matched users"""
    print("\n=== Testing Message Exchange ===")
    
    sio1 = socketio.AsyncClient(logger=False, engineio_logger=False)
    sio2 = socketio.AsyncClient(logger=False, engineio_logger=False)
    
    user1_matched = False
    user2_matched = False
    user1_received_msg = None
    user2_received_msg = None
    
    @sio1.on('match_found')
    async def on_match_1(data):
        nonlocal user1_matched
        user1_matched = True
        print(f"✓ User 1 matched with {data.get('partner', {}).get('name')}")
    
    @sio2.on('match_found')
    async def on_match_2(data):
        nonlocal user2_matched
        user2_matched = True
        print(f"✓ User 2 matched with {data.get('partner', {}).get('name')}")
    
    @sio1.on('new_message')
    async def on_msg_1(data):
        nonlocal user1_received_msg
        user1_received_msg = data.get('message')
        print(f"✓ User 1 received message: '{user1_received_msg}'")
    
    @sio2.on('new_message')
    async def on_msg_2(data):
        nonlocal user2_received_msg
        user2_received_msg = data.get('message')
        print(f"✓ User 2 received message: '{user2_received_msg}'")
    
    try:
        # Connect, register, and join queue for both users
        await sio1.connect(BASE_URL, socketio_path=SOCKET_PATH, transports=['polling'])
        await sio2.connect(BASE_URL, socketio_path=SOCKET_PATH, transports=['polling'])
        await asyncio.sleep(1)
        
        await sio1.emit('register_user', {'name': 'TEST_MsgUser1', 'city': 'MsgTestCity'})
        await sio2.emit('register_user', {'name': 'TEST_MsgUser2', 'city': 'MsgTestCity'})
        await asyncio.sleep(1)
        
        await sio1.emit('join_queue', {'city': 'MsgTestCity'})
        await sio2.emit('join_queue', {'city': 'MsgTestCity'})
        await asyncio.sleep(3)
        
        if user1_matched and user2_matched:
            # Send messages
            test_msg_1 = "Hello from User 1!"
            test_msg_2 = "Hello from User 2!"
            
            print(f"User 1 sending: '{test_msg_1}'")
            await sio1.emit('send_message', {'message': test_msg_1})
            await asyncio.sleep(2)
            
            print(f"User 2 sending: '{test_msg_2}'")
            await sio2.emit('send_message', {'message': test_msg_2})
            await asyncio.sleep(2)
            
            # Results
            print("\n=== Message Exchange Results ===")
            print(f"User 1 received from User 2: {user1_received_msg}")
            print(f"User 2 received from User 1: {user2_received_msg}")
            
            if user1_received_msg == test_msg_2 and user2_received_msg == test_msg_1:
                print("\n✓ Message exchange PASSED!")
                return True
            else:
                print("\n✗ Message exchange FAILED - messages not received correctly")
                return False
        else:
            print("✗ Could not test messages - users not matched")
            return False
            
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        return False
    finally:
        if sio1.connected:
            await sio1.disconnect()
        if sio2.connected:
            await sio2.disconnect()


async def test_report_user():
    """Test report user functionality"""
    print("\n=== Testing Report User ===")
    
    sio1 = socketio.AsyncClient(logger=False, engineio_logger=False)
    sio2 = socketio.AsyncClient(logger=False, engineio_logger=False)
    
    user1_matched = False
    user2_matched = False
    report_submitted = False
    
    @sio1.on('match_found')
    async def on_match_1(data):
        nonlocal user1_matched
        user1_matched = True
    
    @sio2.on('match_found')
    async def on_match_2(data):
        nonlocal user2_matched
        user2_matched = True
    
    @sio1.on('report_submitted')
    async def on_report_submitted(data):
        nonlocal report_submitted
        report_submitted = True
        print(f"✓ Report submitted: {data}")
    
    try:
        await sio1.connect(BASE_URL, socketio_path=SOCKET_PATH, transports=['polling'])
        await sio2.connect(BASE_URL, socketio_path=SOCKET_PATH, transports=['polling'])
        await asyncio.sleep(1)
        
        await sio1.emit('register_user', {'name': 'TEST_ReportUser1', 'city': 'ReportTestCity'})
        await sio2.emit('register_user', {'name': 'TEST_ReportUser2', 'city': 'ReportTestCity'})
        await asyncio.sleep(1)
        
        await sio1.emit('join_queue', {'city': 'ReportTestCity'})
        await sio2.emit('join_queue', {'city': 'ReportTestCity'})
        await asyncio.sleep(3)
        
        if user1_matched and user2_matched:
            print("Users matched - submitting report...")
            await sio1.emit('report_user', {
                'comment': 'Test report comment',
                'chat_history': [
                    {'from': 'me', 'text': 'Test message 1', 'type': 'text'},
                    {'from': 'partner', 'text': 'Test message 2', 'type': 'text'}
                ]
            })
            await asyncio.sleep(2)
            
            if report_submitted:
                print("\n✓ Report user functionality PASSED!")
                return True
            else:
                print("\n✗ Report not submitted")
                return False
        else:
            print("✗ Could not test report - users not matched")
            return False
            
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        return False
    finally:
        if sio1.connected:
            await sio1.disconnect()
        if sio2.connected:
            await sio2.disconnect()


async def test_skip_chat():
    """Test skip chat functionality"""
    print("\n=== Testing Skip Chat ===")
    
    sio1 = socketio.AsyncClient(logger=False, engineio_logger=False)
    sio2 = socketio.AsyncClient(logger=False, engineio_logger=False)
    
    user1_matched = False
    user2_matched = False
    partner_disconnected = False
    chat_ended = False
    
    @sio1.on('match_found')
    async def on_match_1(data):
        nonlocal user1_matched
        user1_matched = True
        print("✓ User 1 matched")
    
    @sio2.on('match_found')
    async def on_match_2(data):
        nonlocal user2_matched
        user2_matched = True
        print("✓ User 2 matched")
    
    @sio2.on('partner_disconnected')
    async def on_partner_disconnected():
        nonlocal partner_disconnected
        partner_disconnected = True
        print("✓ User 2 received partner_disconnected event")
    
    @sio1.on('chat_ended')
    async def on_chat_ended():
        nonlocal chat_ended
        chat_ended = True
        print("✓ User 1 received chat_ended event")
    
    try:
        await sio1.connect(BASE_URL, socketio_path=SOCKET_PATH, transports=['polling'])
        await sio2.connect(BASE_URL, socketio_path=SOCKET_PATH, transports=['polling'])
        await asyncio.sleep(1)
        
        await sio1.emit('register_user', {'name': 'TEST_SkipUser1', 'city': 'SkipTestCity'})
        await sio2.emit('register_user', {'name': 'TEST_SkipUser2', 'city': 'SkipTestCity'})
        await asyncio.sleep(1)
        
        await sio1.emit('join_queue', {'city': 'SkipTestCity'})
        await sio2.emit('join_queue', {'city': 'SkipTestCity'})
        await asyncio.sleep(3)
        
        if user1_matched and user2_matched:
            print("Users matched - User 1 skipping chat...")
            await sio1.emit('skip_chat', {})
            await asyncio.sleep(2)
            
            print("\n=== Skip Results ===")
            print(f"Partner disconnected event received by User 2: {partner_disconnected}")
            print(f"Chat ended event received by User 1: {chat_ended}")
            
            if partner_disconnected and chat_ended:
                print("\n✓ Skip chat functionality PASSED!")
                return True
            else:
                print("\n✗ Skip chat FAILED")
                return False
        else:
            print("✗ Could not test skip - users not matched")
            return False
            
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        return False
    finally:
        if sio1.connected:
            await sio1.disconnect()
        if sio2.connected:
            await sio2.disconnect()


async def main():
    """Run all Socket.IO tests"""
    results = {}
    
    # Test 1: Basic connection
    results['connection'] = await test_socketio_connection()
    
    # Test 2: Two users matching
    results['matching'] = await test_two_users_matching()
    
    # Test 3: Message exchange
    results['messaging'] = await test_message_exchange()
    
    # Test 4: Report user
    results['report'] = await test_report_user()
    
    # Test 5: Skip chat
    results['skip'] = await test_skip_chat()
    
    # Summary
    print("\n" + "="*50)
    print("SOCKET.IO TEST SUMMARY")
    print("="*50)
    passed = 0
    failed = 0
    for test, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{test}: {status}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\nTotal: {passed} passed, {failed} failed")
    return passed, failed


if __name__ == "__main__":
    passed, failed = asyncio.run(main())
    sys.exit(0 if failed == 0 else 1)
