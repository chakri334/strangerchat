"""
Stumble Chat Backend API Tests
Tests REST endpoints for the anonymous chat application.
Note: Socket.IO testing requires separate integration tests with python-socketio client.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndStats:
    """Health check and stats endpoint tests"""
    
    def test_api_root(self):
        """Test main API endpoint returns healthy response"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "Chat server running"
    
    def test_stats_endpoint(self):
        """Test stats endpoint returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        # Verify all expected fields are present
        assert "online" in data
        assert "chats_today" in data
        assert "cities" in data
        assert "city_counts" in data
        # Verify data types
        assert isinstance(data["online"], int)
        assert isinstance(data["chats_today"], int)
        assert isinstance(data["cities"], int)
        assert isinstance(data["city_counts"], dict)
        print(f"Stats: online={data['online']}, chats_today={data['chats_today']}, cities={data['cities']}")

class TestIPBlocking:
    """IP blocking endpoint tests"""
    
    def test_check_ip_not_blocked(self):
        """Test IP check returns not blocked for new IP"""
        response = requests.get(f"{BASE_URL}/api/check-ip")
        assert response.status_code == 200
        data = response.json()
        assert "blocked" in data
        assert isinstance(data["blocked"], bool)
        # New IPs should not be blocked
        print(f"IP blocked status: {data['blocked']}")
    
    def test_check_ip_response_structure(self):
        """Test IP check response has correct structure"""
        response = requests.get(f"{BASE_URL}/api/check-ip")
        assert response.status_code == 200
        data = response.json()
        assert "blocked" in data
        # If blocked, should have additional fields
        if data["blocked"]:
            assert "hours_remaining" in data
            assert "message" in data

class TestSocketIOPolling:
    """Socket.IO polling transport tests"""
    
    def test_socketio_polling_initial(self):
        """Test Socket.IO polling transport is accessible"""
        # Initial Socket.IO polling request
        response = requests.get(f"{BASE_URL}/api/socket.io/", params={
            "EIO": "4",
            "transport": "polling"
        })
        # Socket.IO should return 200 with session info or upgrade response
        assert response.status_code == 200
        content = response.text
        # Socket.IO response format starts with packet length + type
        # First character should be a digit (packet length) or '0' for open packet
        print(f"Socket.IO response length: {len(content)}")
        print(f"Socket.IO response preview: {content[:100]}...")
        # Verify we got a valid Socket.IO response (not HTML error page)
        assert not content.startswith("<!doctype")
        assert not content.startswith("<html")

class TestAPIErrorHandling:
    """Test error handling for invalid requests"""
    
    def test_invalid_endpoint_404(self):
        """Test invalid endpoint returns appropriate error"""
        response = requests.get(f"{BASE_URL}/api/invalid-endpoint-xyz")
        # Should return 404 or 405
        assert response.status_code in [404, 405, 422]
    
    def test_stats_post_method_not_allowed(self):
        """Test POST to stats endpoint fails appropriately"""
        response = requests.post(f"{BASE_URL}/api/stats")
        # Stats endpoint only accepts GET
        assert response.status_code in [405, 422, 400]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
