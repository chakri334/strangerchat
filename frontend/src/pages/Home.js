import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import ChatPage from '../components/ChatPage';
import PersistentChatPage from '../components/PersistentChatPage';
import WaitingPage from '../components/WaitingPage';
import LandingPage from '../components/LandingPage'; // <-- Added LandingPage Import
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
  const [activePeer, setActivePeer] = useState(null); // for persistent chat
  const [chatRefreshKey, setChatRefreshKey] = useState(0);
  const [showLanding, setShowLanding] = useState(true); // <-- Added Landing Visibility State

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

  // Fetch authoritative profile (interests + gender) from backend
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

  // IP block check
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/check-ip`)
      .then((r) => r.json())
      .then((data) => {
        if (data.blocked) { setIsBlocked(true); setBlockMessage(data.message); }
      })
      .catch(() => {});
  }, []);

  // Socket lifecycle
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
