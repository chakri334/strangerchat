import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import ChatPage from '../components/ChatPage';
import WaitingPage from '../components/WaitingPage';
import { Settings as SettingsIcon } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Home = () => {
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [userCity, setUserCity] = useState('Global');
  const [stats, setStats] = useState({ online: 0, chats_today: 0, cities: 0 });
  const [isSearching, setIsSearching] = useState(false);
  const [chatActive, setChatActive] = useState(false);
  const [partner, setPartner] = useState(null);
  const [userName, setUserName] = useState('');
  const [userAge, setUserAge] = useState('');
  const [userGender, setUserGender] = useState('');
  const [photoToView, setPhotoToView] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const socketRef = useRef(null);

  // Check if user is IP blocked on mount
  useEffect(() => {
    const checkBlocked = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/check-ip`);
        const data = await res.json();
        if (data.blocked) {
          setIsBlocked(true);
          setBlockMessage(data.message);
        }
      } catch (err) {
        console.log('Could not check IP block status');
      }
    };
    checkBlocked();
  }, []);

  useEffect(() => {
    // Load user data from localStorage
    const savedName = localStorage.getItem('userName') || `User${Math.floor(Math.random() * 9999)}`;
    const savedAge = localStorage.getItem('userAge') || '';
    const savedGender = localStorage.getItem('userGender') || '';
    const savedCity = localStorage.getItem('userCity') || 'Global';
    
    setUserName(savedName);
    setUserAge(savedAge);
    setUserGender(savedGender);
    setUserCity(savedCity);
    
    // Save if new
    if (!localStorage.getItem('userName')) {
      localStorage.setItem('userName', savedName);
    }
    
    // Initialize socket with polling transport and reconnection options
    const newSocket = io(BACKEND_URL, {
      path: '/api/socket.io',
      transports: ['polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    
    socketRef.current = newSocket;
    
    // Detect location function
    const detectUserLocation = async () => {
      if ('geolocation' in navigator) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          });
          
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`
          );
          const data = await response.json();
          const detectedCity = data.city || data.locality || 'Global';
          setUserCity(detectedCity);
          localStorage.setItem('userCity', detectedCity);
          
          // Update socket
          if (newSocket && newSocket.connected) {
            newSocket.emit('register_user', {
              name: savedName,
              age: savedAge,
              gender: savedGender,
              city: detectedCity
            });
          }
        } catch (error) {
          console.log('Location access denied');
        }
      }
    };
    
    // Detect location
    detectUserLocation();
    
    newSocket.on('connect', () => {
      console.log('✓ Connected to server');
      // Register user immediately
      const userData = {
        name: savedName,
        age: savedAge,
        gender: savedGender,
        city: savedCity
      };
      console.log('Registering user:', userData);
      newSocket.emit('register_user', userData);
    });
    
    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected us, try to reconnect
        newSocket.connect();
      }
    });
    
    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      toast.success('Reconnected to server');
      // Re-register user
      newSocket.emit('register_user', {
        name: savedName,
        age: savedAge,
        gender: savedGender,
        city: savedCity
      });
    });
    
    newSocket.on('reconnect_error', (error) => {
      console.log('Reconnection error:', error);
    });
    
    newSocket.on('reconnect_failed', () => {
      console.log('Reconnection failed');
      toast.error('Connection lost. Please refresh the page.');
    });
    
    newSocket.on('registered', (data) => {
      console.log('✓ User registered successfully');
    });
    
    newSocket.on('blocked', (data) => {
      setIsBlocked(true);
      setBlockMessage(data.message);
      toast.error(data.message);
    });
    
    newSocket.on('stats_update', (data) => {
      console.log('Stats updated:', data);
      setStats(data);
    });
    
    newSocket.on('match_found', (data) => {
      setIsSearching(false);
      setPartner(data.partner);
      setChatActive(true);
      toast.success('Connected to someone!');
    });
    
    newSocket.on('partner_disconnected', () => {
      toast.info('Chat partner disconnected');
      setChatActive(false);
      setPartner(null);
    });
    
    newSocket.on('chat_ended', () => {
      setChatActive(false);
      setPartner(null);
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.close();
    };
  }, []);
  
  const handleConnect = () => {
    if (!socket || !socket.connected) {
      toast.error('Connecting to server...');
      return;
    }
    
    console.log('🔍 Joining queue for city:', userCity);
    console.log('Socket connected:', socket.connected);
    console.log('Socket ID:', socket.id);
    
    setIsSearching(true);
    socket.emit('join_queue', { city: userCity });
    console.log('✓ Emitted join_queue event');
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (isSearching && !chatActive) {
        setIsSearching(false);
        toast.error('No users available right now. Keep trying!');
      }
    }, 30000);
  };
  
  const handleCloseChat = () => {
    setChatActive(false);
    setPartner(null);
    setIsSearching(false);
  };
  
  const handleSkipToNew = () => {
    // Close current chat
    setChatActive(false);
    setPartner(null);
    // Start searching immediately
    setIsSearching(true);
    socket.emit('join_queue', { city: userCity });
    toast.info('Finding new chat...');
  };
  
  const handleCancelSearch = () => {
    setIsSearching(false);
    // Could emit a leave_queue event if needed
  };

  // Show waiting page when searching
  if (isSearching && !chatActive) {
    return <WaitingPage onCancel={handleCancelSearch} />;
  }
  
  // Show full-screen chat when matched
  if (chatActive && partner && socket) {
    return (
      <ChatPage
        socket={socket}
        partner={partner}
        onClose={handleCloseChat}
        onSkip={handleSkipToNew}
      />
    );
  }
  
  // Show blocked message if user is blocked
  if (isBlocked) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center" data-testid="blocked-page">
        <div className="text-center px-6">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Syne, sans-serif' }}>Access Restricted</h1>
          <p className="text-gray-400">{blockMessage || 'You have been temporarily blocked due to multiple reports.'}</p>
        </div>
      </div>
    );
  }

  // Show home page
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden" data-testid="home-page">
      {/* Gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#7c5cfc] opacity-10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#fc5c7d] opacity-10 blur-[120px] rounded-full"></div>
      </div>
      
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="p-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }} data-testid="app-logo">stumble chat</h1>
            <p className="text-sm text-gray-400 mt-1" data-testid="online-count">{stats.online} online</p>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            data-testid="settings-button"
          >
            <SettingsIcon size={20} />
          </button>
        </header>
        
        {/* Location detection happens in background - no UI shown */}
        
        {/* Connect Button */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="text-center">
            <div className="relative inline-block">
              {isSearching && (
                <div className="absolute inset-0 animate-ping">
                  <div className="w-64 h-64 rounded-full bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] opacity-20"></div>
                </div>
              )}
              <button
                onClick={handleConnect}
                disabled={isSearching}
                className="relative w-64 h-64 rounded-full bg-gradient-to-br from-[#7c5cfc] to-[#fc5c7d] shadow-2xl shadow-purple-500/20 hover:shadow-purple-500/40 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="connect-button"
              >
                <span className="text-3xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
                  {isSearching ? 'Searching...' : 'Connect'}
                </span>
              </button>
            </div>
            
            {isSearching && (
              <p className="mt-6 text-gray-400 animate-pulse" data-testid="searching-text">Finding a stranger for you...</p>
            )}
          </div>
        </div>
        
        {/* Stats */}
        <div className="px-6 pb-24">
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 text-center" data-testid="stat-online">
              <div className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.online}</div>
              <div className="text-xs text-gray-400 mt-1">Online Now</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 text-center" data-testid="stat-chats">
              <div className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.chats_today}</div>
              <div className="text-xs text-gray-400 mt-1">Chats Today</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 text-center" data-testid="stat-cities">
              <div className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.cities}</div>
              <div className="text-xs text-gray-400 mt-1">Cities</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
