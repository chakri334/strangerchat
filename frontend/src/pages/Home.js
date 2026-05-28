import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import ChatPage from '../components/ChatPage';
import WaitingPage from '../components/WaitingPage';
import { Analytics } from '../utils/analytics';
import { setGeoTitle, trackCitySearch, trackGeoMatch } from '../utils/seo';
import OnboardingModal from '../components/OnboardingModal';
import AuthOnboarding from '../components/AuthOnboarding';
import { useAuth } from '../contexts/AuthContext';
import HomeHeader from '../components/home/HomeHeader';
import BlockedScreen from '../components/home/BlockedScreen';
import NearbyUsersPanel from '../components/home/NearbyUsersPanel';
import ConnectHero from '../components/home/ConnectHero';
import StatsBar from '../components/home/StatsBar';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const RETRY_INTERVAL_MS = 60000;

const Home = () => {
  const { user, isAuthenticated, signInWithGoogle, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [userCity, setUserCity] = useState('Global');
  const [stats, setStats] = useState({ online: 0, chats_today: 0, cities: 0 });
  const [isSearching, setIsSearching] = useState(false);
  const [chatActive, setChatActive] = useState(false);
  const [partner, setPartner] = useState(null);
  const [userName, setUserName] = useState('');
  const [userGender, setUserGender] = useState('');
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('hasSeenOnboarding')
  );
  const [isAuthed, setIsAuthed] = useState(() => !!localStorage.getItem('authSession'));

  const socketRef = useRef(null);
  const searchTimerRef = useRef(null);
  const searchCountRef = useRef(0);
  const isSearchingRef = useRef(false);
  // Live ref so socket listeners always read current city without re-subscribing
  const userCityRef = useRef('Global');
  useEffect(() => { userCityRef.current = userCity; }, [userCity]);

  const setIsSearchingSync = useCallback((val) => {
    isSearchingRef.current = typeof val === 'function' ? val(isSearchingRef.current) : val;
    setIsSearching(val);
  }, []);

  const loadNearbyUsers = useCallback(async (city) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/active-users?city=${encodeURIComponent(city || 'Global')}`);
      const data = await res.json();
      const mySid = socketRef.current?.id;
      setNearbyUsers((data.users || []).filter((u) => u.sid !== mySid));
    } catch (e) {
      console.log('Failed to load nearby users');
    }
  }, []);

  // Sync authenticated user's name
  useEffect(() => {
    if (user?.name && user.name !== userName) {
      setUserName(user.name);
      localStorage.setItem('userName', user.name);
    }
  }, [user, userName]);

  // Check IP block on mount
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/check-ip`)
      .then((r) => r.json())
      .then((data) => {
        if (data.blocked) {
          setIsBlocked(true);
          setBlockMessage(data.message);
        }
      })
      .catch(() => console.log('Could not check IP block status'));
  }, []);

  // Initialise socket connection once
  useEffect(() => {
    const savedName = localStorage.getItem('userName') || `User${Math.floor(Math.random() * 9999)}`;
    const savedAge = localStorage.getItem('userAge') || '';
    const savedGender = localStorage.getItem('userGender') || '';
    const savedCity = localStorage.getItem('userCity') || 'Global';

    setUserName(savedName);
    setUserGender(savedGender);
    setUserCity(savedCity);

    if (!localStorage.getItem('userName')) {
      localStorage.setItem('userName', savedName);
    }

    const newSocket = io(BACKEND_URL, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 20000,
      forceNew: false,
      multiplex: true,
    });
    socketRef.current = newSocket;

    const detectUserLocation = async () => {
      if (!('geolocation' in navigator)) return;
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
        if (newSocket && newSocket.connected) {
          newSocket.emit('register_user', {
            name: savedName, age: savedAge, gender: savedGender, city: detectedCity,
          });
        }
      } catch {
        console.log('Location access denied');
      }
    };

    detectUserLocation();
    loadNearbyUsers(savedCity);

    newSocket.on('connect', () => {
      setIsConnected(true);
      Analytics.userConnected();
      newSocket.emit('register_user', {
        name: savedName, age: savedAge, gender: savedGender, city: savedCity,
      });
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      Analytics.userDisconnected();
      if (reason !== 'io client disconnect') {
        setTimeout(() => newSocket.connect(), 1000);
      }
    });

    newSocket.on('connect_error', () => setIsConnected(false));

    newSocket.on('reconnect', (attemptNumber) => {
      newSocket.emit('register_user', {
        name: savedName, age: savedAge, gender: savedGender, city: savedCity,
      });
      if (isSearchingRef.current) {
        newSocket.emit('join_queue', { city: savedCity });
      }
      if (attemptNumber > 1) toast.success('Reconnected!');
    });

    newSocket.on('reconnect_failed', () => {
      toast.error('Connection lost. Please refresh the page.');
    });

    newSocket.on('blocked', (data) => {
      setIsBlocked(true);
      setBlockMessage(data.message);
      toast.error(data.message);
    });

    newSocket.on('stats_update', (data) => {
      if (savedGender === 'Male') loadNearbyUsers(userCityRef.current);
      setStats(data);
    });

    newSocket.on('match_found', (data) => {
      isSearchingRef.current = false;
      setIsSearching(false);
      if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
      searchCountRef.current++;
      setPartner(data.partner);
      setChatActive(true);
      Analytics.matchFound(data.partner?.name);
      trackGeoMatch(userCityRef.current, data.partner?.city);
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const sock = socketRef.current;
        if (sock && !sock.connected) sock.connect();
      }
    };
    const handleOnline = () => {
      const sock = socketRef.current;
      if (sock && !sock.connected) sock.connect();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      newSocket.close();
    };
  }, [loadNearbyUsers]);

  const handleDirectChat = useCallback((targetSid) => {
    if (!socket || !socket.connected) {
      toast.error('Not connected yet');
      return;
    }
    setIsSearchingSync(true);
    socket.emit('join_queue', { city: userCity, target_sid: targetSid });
    toast.info('Connecting you to selected user...');
  }, [socket, userCity, setIsSearchingSync]);

  const scheduleRetry = useCallback((thisSearch) => {
    searchTimerRef.current = setTimeout(() => {
      if (searchCountRef.current !== thisSearch) return;
      if (isSearchingRef.current && !chatActive) {
        socketRef.current?.emit('join_queue', { city: userCityRef.current });
        scheduleRetry(thisSearch);
      }
    }, RETRY_INTERVAL_MS);
  }, [chatActive]);

  const handleConnect = useCallback(() => {
    if (!socket) { toast.error('Please wait, initializing...'); return; }
    if (!socket.connected) {
      socket.connect();
      toast.info('Reconnecting...');
      return;
    }
    if (isSearching) return; // prevent duplicate timers

    setIsSearchingSync(true);
    socket.emit('join_queue', { city: userCity });
    Analytics.joinQueue();

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const thisSearch = ++searchCountRef.current;
    scheduleRetry(thisSearch);
  }, [socket, isSearching, userCity, setIsSearchingSync, scheduleRetry]);

  const handleCloseChat = useCallback(() => {
    setChatActive(false);
    setPartner(null);
    setIsSearchingSync(false);
  }, [setIsSearchingSync]);

  const handleSkipToNew = useCallback(() => {
    setChatActive(false);
    setPartner(null);
    setIsSearchingSync(true);
    socket?.emit('join_queue', { city: userCity });
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const thisSearch = ++searchCountRef.current;
    scheduleRetry(thisSearch);
    toast.info('Finding new chat...');
  }, [socket, userCity, setIsSearchingSync, scheduleRetry]);

  const handleCancelSearch = useCallback(() => {
    setIsSearching(false);
    isSearchingRef.current = false;
    if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
    searchCountRef.current++;
    if (socket && socket.connected) socket.emit('leave_queue');
  }, [socket]);

  // ── Routing ────────────────────────────────────────────────────────────
  if (!isAuthed) return <AuthOnboarding onAuthenticated={() => setIsAuthed(true)} />;
  if (showOnboarding) return <OnboardingModal onAccept={() => setShowOnboarding(false)} />;
  if (isSearching && !chatActive) return <WaitingPage onCancel={handleCancelSearch} />;
  if (chatActive && partner && socket) {
    return <ChatPage socket={socket} partner={partner} onClose={handleCloseChat} onSkip={handleSkipToNew} />;
  }
  if (isBlocked) return <BlockedScreen message={blockMessage} />;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden" data-testid="home-page">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#7c5cfc] opacity-10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#fc5c7d] opacity-10 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <HomeHeader
          stats={stats}
          isConnected={isConnected}
          isAuthenticated={isAuthenticated}
          user={user}
          onSignIn={signInWithGoogle}
          onLogout={logout}
        />

        {userGender === 'Male' && (
          <NearbyUsersPanel
            users={nearbyUsers}
            onRefresh={() => loadNearbyUsers(userCity)}
            onSelect={handleDirectChat}
          />
        )}

        <ConnectHero
          isConnected={isConnected}
          isSearching={isSearching}
          onConnect={handleConnect}
        />

        <StatsBar stats={stats} />
      </div>
    </div>
  );
};

export default Home;
