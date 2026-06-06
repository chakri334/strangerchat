import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import ChatPage from '../components/ChatPage';
import PersistentChatPage from '../components/PersistentChatPage';
import WaitingPage from '../components/WaitingPage';
import LandingPage from '../components/LandingPage'; 
import { Analytics } from '../utils/analytics';
import { setGeoTitle, trackCitySearch, trackGeoMatch } from '../utils/seo';
import OnboardingModal from '../components/OnboardingModal';
import AuthOnboarding from '../components/AuthOnboarding';
import { useAuth } from '../contexts/AuthContext';
import BlockedScreen from '../components/home/BlockedScreen';
import AppHeader from '../components/tabs/AppHeader';
import BottomTabBar from '../components/tabs/BottomTabBar';
import PeopleTab from '../components/tabs/PeopleTab';
import ProfileTab from '../components/tabs/ProfileTab';
import RandomChatTab from '../components/tabs/RandomChatTab';
import ChatsTab from '../components/tabs/ChatsTab';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const RETRY_INTERVAL_MS = 60000;

const readStoredInterests = () => {
  try {
    const raw = localStorage.getItem('userInterests');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const isGuestMode = () => {
  try {
    const s = JSON.parse(localStorage.getItem('authSession') || '{}');
    return s.mode === 'guest';
  } catch { return false; }
};

const Home = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [userCity, setUserCity] = useState('Global');
  const [stats, setStats] = useState({ online: 0, chats_today: 0, cities: 0 });
  const [isSearching, setIsSearching] = useState(false);
  const [chatActive, setChatActive] = useState(false);
  const [partner, setPartner] = useState(null);
  const [userName, setUserName] = useState('');
  const [userGender, setUserGender] = useState('');
  const [userInterests, setUserInterests] = useState(readStoredInterests);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('hasSeenOnboarding')
  );
  const [isAuthed, setIsAuthed] = useState(() => !!localStorage.getItem('authSession'));
  const [activeTab, setActiveTab] = useState('random');
  const [activePeer, setActivePeer] = useState(null); 
  const [chatRefreshKey, setChatRefreshKey] = useState(0);
  const [showLanding, setShowLanding] = useState(true); 

  const guest = isGuestMode();
  const myUserId = user?.user_id;

  const socketRef = useRef(null);
  const searchTimerRef = useRef(null);
  const searchCountRef = useRef(0);
  const isSearchingRef = useRef(false);
  const userCityRef = useRef('Global');
  useEffect(() => { userCityRef.current = userCity; }, [userCity]);

  const setIsSearchingSync = useCallback((val) => {
    isSearchingRef.current = typeof val === 'function' ? val(isSearchingRef.current) : val;
    setIsSearching(val);
  }, []);

  useEffect(() => {
    if (user?.name && user.name !== userName) {
      setUserName(user.name);
      localStorage.setItem('userName', user.name);
    }
  }, [user, userName]);

  useEffect(() => {
    if (!isAuthenticated || guest) return;
    fetch(`${BACKEND_URL}/api/profile/me`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${sessionStorage.getItem('session_token') || ''}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok && data.profile) {
          const ints = data.profile.interests || [];
          setUserInterests(ints);
          localStorage.setItem('userInterests', JSON.stringify(ints));
          if (data.profile.gender) {
            setUserGender(data.profile.gender);
            localStorage.setItem('userGender', data.profile.gender);
          }
        }
      })
      .catch(() => {});
  }, [isAuthenticated, guest]);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/check-ip`)
      .then((r) => r.json())
      .then((data) => {
        if (data.blocked) { setIsBlocked(true); setBlockMessage(data.message); }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const savedName = localStorage.getItem('userName') || `User${Math.floor(Math.random() * 9999)}`;
    const savedAge = localStorage.getItem('userAge') || '';
    const savedGender = localStorage.getItem('userGender') || '';
    const savedCity = localStorage.getItem('userCity') || 'Global';

    setUserName(savedName);
    setUserGender(savedGender);
    setUserCity(savedCity);
    if (!localStorage.getItem('userName')) localStorage.setItem('userName', savedName);

    const newSocket = io(BACKEND_URL, {
      path: '/api/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 1000, reconnectionDelayMax: 10000, randomizationFactor: 0.5,
      timeout: 20000, forceNew: false, multiplex: true,
    });
    socketRef.current = newSocket;

    const buildRegisterPayload = (city) => ({
      name: savedName, age: savedAge, gender: savedGender, city,
      interests: readStoredInterests(),
      session_token: sessionStorage.getItem('session_token') || undefined,
    });

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
        if (newSocket.connected) newSocket.emit('register_user', { ...buildRegisterPayload(detectedCity), lat: position.coords.latitude, lng: position.coords.longitude });
      } catch {}
    };

    detectUserLocation();

    newSocket.on('connect', () => {
      setIsConnected(true);
      Analytics.userConnected();
      newSocket.emit('register_user', buildRegisterPayload(savedCity));
    });
    newSocket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        setIsConnected(false);
      }
      Analytics.userDisconnected();
    });
    newSocket.on('connect_error', () => {});
    newSocket.on('reconnect', () => {
      newSocket.emit('register_user', buildRegisterPayload(savedCity));
      if (isSearchingRef.current) newSocket.emit('join_queue', { city: savedCity });
    });
    newSocket.on('blocked', (data) => { setIsBlocked(true); setBlockMessage(data.message); toast.error(data.message); });
    newSocket.on('stats_update', (data) => setStats(data));
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
      toast.info('Partner left. Finding a new stranger…');
      setChatActive(false);
      setPartner(null);
      setIsSearchingSync(true);
      newSocket.emit('join_queue', { city: userCityRef.current });
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      const thisSearch = ++searchCountRef.current;
      searchTimerRef.current = setTimeout(function retry() {
        if (searchCountRef.current !== thisSearch) return;
        if (isSearchingRef.current) {
          socketRef.current?.emit('join_queue', { city: userCityRef.current });
          searchTimerRef.current = setTimeout(retry, RETRY_INTERVAL_MS);
        }
      }, RETRY_INTERVAL_MS);
    });
    newSocket.on('chat_ended', () => { setChatActive(false); setPartner(null); });

    newSocket.on('direct_message', () => setChatRefreshKey((k) => k + 1));
    newSocket.on('message_deleted', () => setChatRefreshKey((k) => k + 1));
    newSocket.on('conversation_cleared', () => setChatRefreshKey((k) => k + 1));

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (!socket || !socket.connected) return;
    socket.emit('register_user', {
      name: userName || 'Anonymous',
      age: localStorage.getItem('userAge') || '',
      gender: userGender,
      city: userCity,
      interests: userInterests,
      session_token: sessionStorage.getItem('session_token') || undefined,
    });
  }, [userInterests, userGender, userName, userCity, socket]);

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
    if (!socket) { toast.error('Please wait, initializing…'); return; }
    if (!socket.connected) { socket.connect(); toast.info('Reconnecting…'); return; }
    if (isSearching) return;
    setIsSearchingSync(true);
    socket.emit('join_queue', { city: userCity });
    Analytics.joinQueue();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const thisSearch = ++searchCountRef.current;
    scheduleRetry(thisSearch);
  }, [socket, isSearching, userCity, setIsSearchingSync, scheduleRetry]);

  const handleCloseChat = useCallback(() => {
    setChatActive(false); setPartner(null); setIsSearchingSync(false);
  }, [setIsSearchingSync]);

  const handleSkipToNew = useCallback(() => {
    setChatActive(false); setPartner(null);
    setIsSearchingSync(true);
    socket?.emit('join_queue', { city: userCity });
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const thisSearch = ++searchCountRef.current;
    scheduleRetry(thisSearch);
    toast.info('Finding new chat…');
  }, [socket, userCity, setIsSearchingSync, scheduleRetry]);

  const handleCancelSearch = useCallback(() => {
    setIsSearching(false);
    isSearchingRef.current = false;
    if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
    searchCountRef.current++;
    if (socket && socket.connected) socket.emit('leave_queue');
  }, [socket]);

  const handleProfileSaved = useCallback((p) => {
    if (p?.interests) {
      setUserInterests(p.interests);
      localStorage.setItem('userInterests', JSON.stringify(p.interests));
    }
    if (p?.gender !== undefined) {
      setUserGender(p.gender);
      localStorage.setItem('userGender', p.gender || '');
    }
    if (p?.name) setUserName(p.name);
  }, []);

  const openDirectChat = useCallback((peer) => {
    if (!peer?.user_id) {
      toast.error('That user is anonymous and cannot be saved-messaged.');
      return;
    }
    setActivePeer(peer);
  }, []);

  // ── Routing guards ─────────────────────────────────────────────────────
  // ── Routing guards ─────────────────────────────────────────────────────
  // ── Routing guards ─────────────────────────────────────────────────────
  if (showLanding) {
    return (
      <LandingPage 
        onGetStarted={() => {
          setShowLanding(false);
          if (!isAuthed) {
            try {
              // Sets up a clean guest session state in local storage
              localStorage.setItem('authSession', JSON.stringify({ mode: 'guest' }));
              setIsAuthed(true);
            } catch (e) {}
          }
          
          // Small operational delay to give React time to mount the RandomChat layout
          setTimeout(() => {
            handleConnect();
          }, 100);
        }} 
        liveUsersCount={stats?.online > 0 ? stats.online.toLocaleString() : "1,200+"} 
      />
    );
  }

  if (!isAuthed) return <AuthOnboarding onAuthenticated={() => setIsAuthed(true)} />;
  if (showOnboarding) return <OnboardingModal onAccept={() => setShowOnboarding(false)} />;
  if (isSearching && !chatActive) return <WaitingPage onCancel={handleCancelSearch} />;
  if (chatActive && partner && socket) {
    return <ChatPage socket={socket} partner={partner} onClose={handleCloseChat} onSkip={handleSkipToNew} />;
  }
  if (activePeer) {
    return (
      <PersistentChatPage
        peer={activePeer}
        socket={socket}
        myUserId={myUserId}
        onBack={() => { setActivePeer(null); setChatRefreshKey((k) => k + 1); }}
        onBlocked={() => setChatRefreshKey((k) => k + 1)}
      />
    );
  }
  if (isBlocked) return <BlockedScreen message={blockMessage} />;

  const profileForHeader = { name: user?.name || userName, avatar: user?.picture ? null : '😊' };

  if (guest) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100" data-testid="guest-home">
        <AppHeader
  profile={profileForHeader}
  isConnected={isConnected}
  isAuthenticated={isAuthenticated}
  onLogout={() => {
    // 1. Clear out the cached username, gender, and session data
    localStorage.removeItem('userName');
    localStorage.removeItem('userGender');
    localStorage.removeItem('userInterests');
    localStorage.removeItem('authSession');
    
    // 2. Force the application state back to the landing page gateway
    setShowLanding(true);
    setIsAuthed(false);
    
    // 3. Call your existing AuthContext logout handler to clear cookies/tokens
    logout();
  }}
/>
        <main className="flex flex-1 flex-col">
          <div style={{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap'}}>
            <h2>Free Random Chat App – Meet Strangers Online</h2>
            <p>Stumble Chat is a free random chat app to meet strangers from India and worldwide. No sign up required. Connect instantly and start chatting.</p>
            <h2>How It Works</h2>
            <p>Click connect, get matched with a random stranger, and start chatting instantly. Share photos, have real conversations, and meet new people every day.</p>
            <h2>Why Stumble Chat?</h2>
            <p>100% free. No registration needed. Anonymous random chat. Meet people from Mumbai, Delhi, Chennai, Bangalore and cities across India.</p>
            <h2>Chat with Strangers Safely</h2>
            <p>Stumble Chat has community guidelines, reporting tools, and IP blocking to keep conversations safe and enjoyable for everyone.</p>
          </div>
          <RandomChatTab
            isConnected={isConnected}
            isSearching={isSearching}
            onConnect={handleConnect}
            stats={stats}
          />
        </main>
        <div className="text-center text-[10px] text-slate-500 py-3 border-t border-slate-900">
          <span style={{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap'}}>
            <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/guidelines">Community Guidelines</a>
          </span>
          Guest mode · Random Chat only ·{' '}
          <button
            onClick={() => { localStorage.removeItem('authSession'); setIsAuthed(false); }}
            className="text-emerald-400 underline"
            data-testid="upgrade-to-google-btn"
          >
            Sign in with Google
          </button>
          {' '}to unlock People, Chats and Profile
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100" data-testid="home-page">
      <AppHeader
        profile={profileForHeader}
        isConnected={isConnected}
        isAuthenticated={isAuthenticated}
        onLogout={logout}
      />

      <main className="flex flex-1 flex-col overflow-hidden pb-16">
        <div style={{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap'}}>
          <h2>Free Random Chat App – Meet Strangers Online</h2>
          <p>Stumble Chat is a free random chat app to meet strangers from India and worldwide. No sign up required. Connect instantly and start chatting.</p>
          <h2>How It Works</h2>
          <p>Click connect, get matched with a random stranger, and start chatting instantly. Share photos, have real conversations, and meet new people every day.</p>
          <h2>Why Stumble Chat?</h2>
          <p>100% free. No registration needed. Anonymous random chat. Meet people from Mumbai, Delhi, Chennai, Bangalore and cities across India.</p>
          <h2>Chat with Strangers Safely</h2>
          <p>Stumble Chat has community guidelines, reporting tools, and IP blocking to keep conversations safe and enjoyable for everyone.</p>
        </div>
        {activeTab === 'people' && <PeopleTab onOpenChat={openDirectChat} />}
        {activeTab === 'random' && (
          <RandomChatTab isConnected={isConnected} isSearching={isSearching} onConnect={handleConnect} stats={stats} />
        )}
        {activeTab === 'chats' && (
          <ChatsTab
            refreshKey={chatRefreshKey}
            onOpenChat={openDirectChat}
            onGoMatch={() => setActiveTab('random')}
            onGoPeople={() => setActiveTab('people')}
          />
        )}
        {activeTab === 'profile' && <ProfileTab onSaved={handleProfileSaved} onOpenChat={openDirectChat} />}
      </main>

      <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
      <div style={{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap'}}>
        <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/guidelines">Community Guidelines</a> · <a href="/cookies">Cookie Policy</a>
      </div>
    </div>
  );
};

export default Home;
