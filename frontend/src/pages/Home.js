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
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [userCity, setUserCity] = useState('Global');
  const [stats, setStats] = useState({ online: 0, chats_today: 0, cities: 0 });
  const [isSearching, setIsSearching] = useState(false);
  const [chatActive, setChatActive] = useState(false);
  const [partner, setPartner] = useState(null);
  const [userName, setUserName] = useState(() => {
    // Resolve correct name at init time — never bleed logged-in name into guest session
    if (isGuestMode()) return `User${Math.floor(Math.random() * 9999)}`;
    return localStorage.getItem('userName') || `User${Math.floor(Math.random() * 9999)}`;
  });
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

  // FIX: Tie the dynamic guest evaluation explicitly to the isAuthed state tree
  const guest = isAuthed && isGuestMode();
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
    const randomGuestName = `User${Math.floor(Math.random() * 9999)}`;
    const savedName = guest ? randomGuestName : (localStorage.getItem('userName') || randomGuestName);
    const savedAge = guest ? '' : (localStorage.getItem('userAge') || '');
    const savedGender = guest ? '' : (localStorage.getItem('userGender') || '');
    const savedCity = localStorage.getItem('userCity') || 'Global';

    setUserName(savedName);
    setUserGender(savedGender);
    setUserCity(savedCity);
    
    if (!guest && !localStorage.getItem('userName')) {
      localStorage.setItem('userName', savedName);
    }

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
      interests: guest ? [] : readStoredInterests(),
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
      } catch (e) { if (process.env.NODE_ENV === 'development') console.warn('Geolocation failed:', e); }
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

    // Global wave-received toast (kept on Home so it works no matter which tab the user is on)
    newSocket.on('wave_received', ({ from_user_id, from_name }) => {
      const sessionToken = sessionStorage.getItem('session_token') || '';
      toast(`👋 ${from_name} waved at you!`, {
        description: 'Tap "Wave back" to mutually match and unlock DM.',
        duration: 8000,
        action: sessionToken ? {
          label: 'Wave back',
          onClick: async () => {
            try {
              const { apiJSON } = await import('../utils/api');
              const { data } = await apiJSON('/api/waves/send', {
                method: 'POST',
                headers: { Authorization: `Bearer ${sessionToken}` },
                body: JSON.stringify({ to_user_id: from_user_id }),
              });
              if (data?.status === 'matched') {
                toast.success(`🎉 Mutual wave with ${from_name}! Opening unlock…`);
                setActiveTab('people'); // PeopleTab listens to wave_matched and opens AdUnlockModal
              } else if (data?.ok) {
                toast.success(`👋 Wave sent to ${from_name}!`);
              } else {
                toast.error(data?.message || 'Could not wave back.');
              }
            } catch {
              toast.error('Failed to wave back. Try again.');
            }
          },
        } : undefined,
      });
    });

    setSocket(newSocket);

    return () => newSocket.close();
  // Socket is created ONCE and lives for the component lifetime. We intentionally
  // omit `guest`/`isAuthed` from deps — flipping them used to close & recreate the
  // socket, which the server saw as a disconnect mid-match, firing partner_disconnected
  // to the user's actual chat partner and breaking matching. Identity updates are
  // re-emitted via the useEffect below on register_user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket || !socket.connected) return;
    socket.emit('register_user', {
      name: userName || 'Anonymous',
      age: guest ? '' : (localStorage.getItem('userAge') || ''),
      gender: userGender,
      city: userCity,
      interests: guest ? [] : userInterests,
      session_token: sessionStorage.getItem('session_token') || undefined,
    });
  }, [userInterests, userGender, userName, userCity, socket, guest]);

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

  const handleAbsoluteLogout = useCallback(() => {
    localStorage.clear();
    sessionStorage.clear();
    try {
      logout();
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('logout() threw during full reset:', e);
    }
    window.location.href = '/';
  }, [logout]);

  // ── Routing guards ─────────────────────────────────────────────────────
  if (showLanding) {
    return (
      <LandingPage 
        onGetStarted={() => {
          try {
            localStorage.setItem('authSession', JSON.stringify({ mode: 'guest' }));
              localStorage.removeItem('userName'); // prevent previous user's name bleeding into guest
          } catch (e) {
            if (process.env.NODE_ENV === 'development') console.warn('localStorage write blocked (private mode?):', e);
          }
          setShowLanding(false);
          setIsAuthed(true);
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
  if (isBlocked) return <BlockedScreen message={blockMessage} />;
  
  // In guest mode the AuthContext `user` may still hold the previous Google
  // identity from cache — never let it bleed into the header.
  const profileForHeader = guest
    ? { name: userName, avatar: '😊' }
    : { name: user?.name || userName, avatar: user?.picture ? null : '😊' };

  // 1. GUEST INTERCEPT: Strict layout isolation
  if (guest) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100" data-testid="guest-home">
        <AppHeader
          profile={profileForHeader}
          isConnected={isConnected}
          isAuthenticated={isAuthenticated && !guest}
          authLoading={authLoading}
          onLogout={handleAbsoluteLogout}
        />
        <main className="flex flex-1 flex-col">
          {isSearching && !chatActive ? (
            <WaitingPage onCancel={handleCancelSearch} />
          ) : chatActive && partner && socket ? (
            <ChatPage socket={socket} partner={partner} onClose={handleCloseChat} onSkip={handleSkipToNew} />
          ) : (
            <RandomChatTab isConnected={isConnected} isSearching={isSearching} onConnect={handleConnect} stats={stats} />
          )}
        </main>
        <div className="text-center text-[10px] text-slate-500 py-3 border-t border-slate-900">
          Guest mode · Random Chat only ·{' '}
          <button onClick={() => { localStorage.removeItem('authSession'); setIsAuthed(false); }} className="text-emerald-400 underline" data-testid="upgrade-to-google-btn">
            Sign in with Google
          </button>
          {' '}to unlock People, Chats and Profile
        </div>
      </div>
    );
  }

  // 2. FULL ACCESS: Standard member view orchestration
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100" data-testid="home-page">
      <AppHeader profile={profileForHeader} isConnected={isConnected} isAuthenticated={isAuthenticated} authLoading={authLoading} onLogout={handleAbsoluteLogout} />
      <main className="flex flex-1 flex-col overflow-hidden pb-16">
        {activeTab === 'people' && (
          <PeopleTab
            onOpenChat={openDirectChat}
            socket={socket}
            sessionToken={sessionStorage.getItem('session_token') || ''}
          />
        )}
        {activeTab === 'random' && (
          <RandomChatTab isConnected={isConnected} isSearching={isSearching} onConnect={handleConnect} stats={stats} />
        )}
        {activeTab === 'chats' && (
          <ChatsTab refreshKey={chatRefreshKey} onOpenChat={openDirectChat} onGoMatch={() => setActiveTab('random')} onGoPeople={() => setActiveTab('people')} />
        )}
        {activeTab === 'profile' && <ProfileTab onSaved={handleProfileSaved} onOpenChat={openDirectChat} />}
      </main>
      <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
};

export default Home;
