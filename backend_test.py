import requests
import socketio
import asyncio
import sys
import time
from datetime import datetime

class ChatAppTester:
    def __init__(self, base_url="https://chat-connect-448.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.socket = None

    def run_test(self, name, test_func, *args, **kwargs):
        """Run a single test"""
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            result = test_func(*args, **kwargs)
            if result:
                self.tests_passed += 1
                print(f"✅ Passed - {name}")
                return True
            else:
                print(f"❌ Failed - {name}")
                return False
        except Exception as e:
            print(f"❌ Failed - {name} - Error: {str(e)}")
            return False

    def test_api_root(self):
        """Test basic API endpoint"""
        try:
            response = requests.get(f"{self.base_url}/api/", timeout=10)
            success = response.status_code == 200 and 'Chat server running' in response.text
            if success:
                print(f"✅ Root API - Status: {response.status_code}")
            else:
                print(f"❌ Root API - Status: {response.status_code}, Response: {response.text}")
            return success
        except Exception as e:
            print(f"❌ Root API - Error: {str(e)}")
            return False

    def test_stats_api(self):
        """Test stats endpoint"""
        try:
            response = requests.get(f"{self.base_url}/api/stats", timeout=10)
            if response.status_code == 200:
                data = response.json()
                required_fields = ['online', 'chats_today', 'cities', 'city_counts']
                if all(field in data for field in required_fields):
                    print(f"✅ Stats API - Data: {data}")
                    return True
                else:
                    print(f"❌ Stats API - Missing fields: {data}")
                    return False
            else:
                print(f"❌ Stats API - Status: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Stats API - Error: {str(e)}")
            return False

    def test_socket_connection(self):
        """Test Socket.IO connection"""
        try:
            # Try different socket paths
            socket_urls = [
                self.base_url,
                f"{self.base_url}/api",
                "http://localhost:8001"
            ]
            
            for socket_url in socket_urls:
                print(f"Trying Socket.IO connection to: {socket_url}")
                try:
                    sio = socketio.Client()
                    connected = False
                    registration_success = False
                    
                    @sio.event
                    def connect():
                        nonlocal connected
                        connected = True
                        print(f"✅ Socket.IO connected to {socket_url}")
                    
                    @sio.event
                    def registered(data):
                        nonlocal registration_success
                        registration_success = True
                        print(f"✅ Registration successful: {data}")
                    
                    @sio.event
                    def disconnect():
                        print("Socket.IO disconnected")
                    
                    sio.connect(socket_url, wait_timeout=5)
                    time.sleep(2)  # Wait for connection
                    
                    if connected:
                        # Test registration
                        sio.emit('register_user', {
                            'name': 'TestUser',
                            'age': '25',
                            'gender': 'Other', 
                            'city': 'TestCity'
                        })
                        time.sleep(2)
                        
                        # Test get random topic
                        sio.emit('get_random_topic', {})
                        time.sleep(1)
                        
                        sio.disconnect()
                        print(f"✅ Socket.IO working at: {socket_url}")
                        return True
                    
                except Exception as inner_e:
                    print(f"❌ Failed {socket_url}: {str(inner_e)}")
                    try:
                        sio.disconnect()
                    except:
                        pass
                    continue
            
            print("❌ All Socket.IO connection attempts failed")
            return False
                
        except Exception as e:
            print(f"❌ Socket.IO test error: {str(e)}")
            return False

    def test_socket_events(self):
        """Test Socket.IO events with two clients"""
        try:
            # Create two clients
            client1 = socketio.Client()
            client2 = socketio.Client()
            
            events_received = {
                'client1_registered': False,
                'client2_registered': False,
                'match_found': False,
                'message_received': False
            }
            
            @client1.event
            def connect():
                print("Client 1 connected")
                client1.emit('register_user', {
                    'name': 'TestUser1',
                    'age': '25',
                    'gender': 'Male',
                    'city': 'TestCity'
                })
            
            @client2.event  
            def connect():
                print("Client 2 connected")
                client2.emit('register_user', {
                    'name': 'TestUser2', 
                    'age': '26',
                    'gender': 'Female',
                    'city': 'TestCity'
                })
            
            @client1.event
            def registered(data):
                events_received['client1_registered'] = True
                print("Client 1 registered")
                # Join queue
                client1.emit('join_queue', {'city': 'TestCity'})
            
            @client2.event
            def registered(data):
                events_received['client2_registered'] = True
                print("Client 2 registered") 
                # Join queue after small delay
                time.sleep(0.5)
                client2.emit('join_queue', {'city': 'TestCity'})
            
            @client1.event
            def match_found(data):
                events_received['match_found'] = True
                print(f"Client 1 match found: {data}")
                # Send a test message
                client1.emit('send_message', {'message': 'Hello from client 1'})
            
            @client2.event
            def new_message(data):
                events_received['message_received'] = True
                print(f"Client 2 received message: {data}")
            
            # Connect both clients
            client1.connect(self.base_url, wait_timeout=10)
            client2.connect(self.base_url, wait_timeout=10)
            
            # Wait for events to process
            time.sleep(5)
            
            # Check results
            success = all(events_received.values())
            
            if success:
                print("✅ Socket.IO events working correctly")
            else:
                print(f"❌ Socket.IO events failed: {events_received}")
            
            # Cleanup
            client1.disconnect()
            client2.disconnect()
            
            return success
            
        except Exception as e:
            print(f"❌ Socket events test error: {str(e)}")
            return False

def main():
    print("🚀 Starting Chat App Backend Tests...\n")
    
    tester = ChatAppTester()
    
    # Run basic API tests
    tester.run_test("API Root Endpoint", tester.test_api_root)
    tester.run_test("Stats API Endpoint", tester.test_stats_api)
    
    # Run Socket.IO tests
    tester.run_test("Socket.IO Connection", tester.test_socket_connection)
    tester.run_test("Socket.IO Events & Matching", tester.test_socket_events)
    
    # Print results
    print(f"\n📊 Backend Tests Summary:")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())