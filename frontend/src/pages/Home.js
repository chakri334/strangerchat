import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import ChatPage from '../components/ChatPage';
import WaitingPage from '../components/WaitingPage';
import { Settings as SettingsIcon } from 'lucide-react';
import { Analytics } from '../utils/analytics';
import { setGeoTitle, trackCitySearch, trackGeoMatch } from '../utils/seo';
import OnboardingModal from '../components/OnboardingModal';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Home = () => {
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [userCity, setUserCity] = useState('Global');
  const [stats, setStats] = useState({ online: 0, chats_today: 0, cities: 0 });
  const [isSearching, setIsSearching] = useState(false);
  // Wrapper that keeps isSearchingRef in sync so reconnect handler reads live value
  const setIsSearchingSync = (val) => {
    isSearchingRef.current = typeof val === 'function' ? val(isSearchingRef.current) : val;
    setIsSearching(val);
  };
  const [chatActive, setChatActive] = useState(false);
  const [partner, setPartner] = useState(null);
  const [userName, setUserName] = useState('');
  const [userAge, setUserAge] = useState('');
  const [userGender, setUserGender] = useState('');
  const [photoToView, setPhotoToView] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('hasSeenOnboarding')
  );
  const socketRef = useRef(null);
  const searchTimerRef = useRef(null);   // tracks the active search timeout
  const searchCountRef = useRef(0);      // prevents stale closure bug on isSearching
  const isSearchingRef = useRef(false);  // live isSearching value for reconnect handler

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
    
    // Strong connection config — optimised for mobile users in India
    const newSocket = io(BACKEND_URL, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'], // WebSocket first, polling as fallback
      reconnection: true,
      reconnectionAttempts: Infinity,  // Keep trying forever — don't give up
      reconnectionDelay: 1000,         // Start retrying after 1s
      reconnectionDelayMax: 10000,     // Cap at 10s between retries
      randomizationFactor: 0.5,        // Spread out reconnect storms
      timeout: 20000,
      forceNew: false,
      multiplex: true
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
          setGeoTitle(detectedCity);
          trackCitySearch(detectedCity);
          
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
      setIsConnected(true);
      Analytics.userConnected();
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
      setIsConnected(false);
      Analytics.userDisconnected();
      // Reconnect for ALL disconnect reasons except deliberate client-side close
      // 'io server disconnect' = server kicked us (blocked, etc) — still reconnect
      // 'transport close' = network dropped (mobile background, lost signal)
      // 'transport error' = connection error
      // 'ping timeout' = server didn't hear from us (phone was backgrounded)
      if (reason !== 'io client disconnect') {
        console.log('Auto-reconnecting due to:', reason);
        setTimeout(() => newSocket.connect(), 1000);
      }
    });
    
    newSocket.on('connect_error', (error) => {
      console.log('Connection error:', error);
      setIsConnected(false);
    });
    
    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');

      // Step 1: Re-register — server removes user from active_connections on disconnect
      newSocket.emit('register_user', {
        name: savedName,
        age: savedAge,
        gender: savedGender,
        city: savedCity
      });

      // Step 2: THE KEY FIX
      // If user was on WaitingPage when the connection dropped, the server
      // removed them from waiting_queue on disconnect. The WaitingPage still
      // shows but the user is invisible to anyone joining the queue.
      // Fix: re-emit join_queue after reconnect if still searching.
      // isSearchingRef holds the live value (avoids stale closure bug).
      if (isSearchingRef.current) {
        console.log('Reconnected while on WaitingPage — rejoining queue...');
        newSocket.emit('join_queue', { city: savedCity });
      }

      if (attemptNumber > 1) {
        toast.success('Reconnected!');
      }
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
      setIsSearchingSync(false);
      // Clear retry timer — we found a match, no more retries needed
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      searchCountRef.current++; // invalidate any pending timers
      setPartner(data.partner);
      setChatActive(true);
      Analytics.matchFound(data.partner?.name);
      trackGeoMatch(userCity, data.partner?.city);
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

    // Page Visibility API — fires when phone screen wakes up or user
    // switches back to the browser tab after backgrounding it.
    // Without this, mobile users return to a broken connection silently.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became visible — checking connection...');
        const sock = socketRef.current;
        if (sock && !sock.connected) {
          console.log('Socket was disconnected while hidden — reconnecting...');
          sock.connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Online/offline events — fires when phone regains mobile data or WiFi
    const handleOnline = () => {
      console.log('Network came back online — reconnecting socket...');
      const sock = socketRef.current;
      if (sock && !sock.connected) {
        sock.connect();
      }
    };
    window.addEventListener('online', handleOnline);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      newSocket.close();
    };
  }, []);
  
  const handleConnect = () => {
    if (!socket) {
      toast.error('Please wait, initializing...');
      return;
    }
    
    if (!socket.connected) {
      socket.connect();
      toast.info('Reconnecting...');
      setTimeout(() => {
        if (socket.connected) handleConnect();
        else toast.error('Connection failed. Please refresh the page.');
      }, 2000);
      return;
    }

    // FIX: Block duplicate Connect clicks while already searching.
    // Without this, each extra click adds another timeout timer
    // that later fires leave_queue and removes the user from the queue.
    if (isSearching) {
      console.log('Already searching — ignoring duplicate Connect click');
      return;
    }
    
    console.log('🔍 Joining queue for city:', userCity);
    
    setIsSearchingSync(true);
    socket.emit('join_queue', { city: userCity });
    Analytics.joinQueue();

    // FIX: Cancel any previous search timer before starting a new one.
    // Prevents ghost timers from old clicks firing leave_queue unexpectedly.
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // FIX: Increment search count — used to detect stale timers.
    // If user cancels and restarts, the old timer's count won't match
    // and it won't fire leave_queue on the new search.
    const thisSearch = ++searchCountRef.current;

    // Auto-retry every 60s instead of giving up.
    // User1 waiting 3+ minutes now keeps retrying silently.
    const scheduleRetry = () => {
      searchTimerRef.current = setTimeout(() => {
        // Stale closure fix: check ref count matches this search session
        if (searchCountRef.current !== thisSearch) return;

        // If still searching and no match, re-emit join_queue silently
        // This re-registers in the backend queue and reschedules
        // Read live value from ref — avoids stale closure on isSearching
        if (isSearchingRef.current && !chatActive) {
          console.log('Still searching — re-joining queue...');
          socket.emit('join_queue', { city: userCity });
          scheduleRetry();
        }
      }, 60000);
    };
    scheduleRetry();
  };
  
  const handleCloseChat = () => {
    setChatActive(false);
    setPartner(null);
    setIsSearchingSync(false);
  };
  
  const handleSkipToNew = () => {
    setChatActive(false);
    setPartner(null);

    // FIX 1: Use setIsSearchingSync so isSearchingRef.current = true.
    // Without this, if connection drops during the new search after skip,
    // the reconnect handler sees isSearchingRef.current = false and
    // never re-joins the queue — User1 is invisible to everyone.
    setIsSearchingSync(true);
    socket.emit('join_queue', { city: userCity });

    // FIX 2: Start the retry timer — without this, if nobody is found
    // within the first attempt, join_queue is never re-emitted.
    // handleConnect() normally does this but skip bypasses handleConnect.
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const thisSearch = ++searchCountRef.current;
    const scheduleRetry = () => {
      searchTimerRef.current = setTimeout(() => {
        if (searchCountRef.current !== thisSearch) return;
        setIsSearching(prev => {
          if (prev) {
            socket.emit('join_queue', { city: userCity });
            scheduleRetry();
          }
          return prev;
        });
      }, 60000);
    };
    scheduleRetry();

    toast.info('Finding new chat...');
  };
  
  const handleCancelSearch = () => {
    setIsSearching(false);
    // Clear the retry timer so it doesn't fire after cancel
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    searchCountRef.current++; // invalidate any pending timers
    // Tell server to remove from queue
    if (socket && socket.connected) {
      socket.emit('leave_queue');
    }
  };

  // Show waiting page when searching
  // Show onboarding on first visit
  if (showOnboarding) {
    return <OnboardingModal onAccept={() => setShowOnboarding(false)} />;
  }

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
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`}></span>
              <p className="text-sm text-gray-400" data-testid="online-count">
                {isConnected ? `${stats.online} online` : 'Connecting...'}
              </p>
            </div>
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
                disabled={isSearching || !isConnected}
                className={`relative w-64 h-64 rounded-full bg-gradient-to-br from-[#7c5cfc] to-[#fc5c7d] shadow-2xl shadow-purple-500/20 hover:shadow-purple-500/40 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${!isConnected ? 'opacity-50' : ''}`}
                data-testid="connect-button"
              >
                <span className="text-3xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
                  {!isConnected ? 'Loading...' : isSearching ? 'Searching...' : 'Connect'}
                </span>
              </button>
            </div>
            
            {!isConnected && !isSearching && (
              <p className="mt-6 text-yellow-400 animate-pulse">Connecting to server...</p>
            )}
            
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
