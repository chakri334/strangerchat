import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import ChatModal from '../components/ChatModal';
import PhotoViewer from '../components/PhotoViewer';
import { Settings as SettingsIcon } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Home = () => {
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [userCity, setUserCity] = useState('Global');
  const [cities, setCities] = useState(['Global', 'New York', 'London', 'Tokyo', 'Mumbai', 'Sydney']);
  const [stats, setStats] = useState({ online: 0, chats_today: 0, cities: 0 });
  const [isSearching, setIsSearching] = useState(false);
  const [chatActive, setChatActive] = useState(false);
  const [partner, setPartner] = useState(null);
  const [userName, setUserName] = useState('');
  const [userAge, setUserAge] = useState('');
  const [userGender, setUserGender] = useState('');
  const [photoToView, setPhotoToView] = useState(null);

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
    
    // Detect user location
    detectLocation();
    
    // Initialize socket with polling transport
    const newSocket = io(BACKEND_URL, {
      path: '/api/socket.io',
      transports: ['polling']
    });
    
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
    
    newSocket.on('registered', (data) => {
      console.log('✓ User registered successfully');
    });
    
    newSocket.on('stats_update', (data) => {
      console.log('Stats updated:', data);
      setStats(data);
      if (data.city_counts) {
        const cityList = Object.keys(data.city_counts);
        setCities(['Global', ...cityList]);
      }
    });
    
    newSocket.on('match_found', (data) => {
      setIsSearching(false);
      setPartner(data.partner);
      setChatActive(true);
      toast.success('Connected to a stranger!');
    });
    
    newSocket.on('partner_disconnected', () => {
      toast.info('Stranger disconnected');
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
  
  const detectLocation = async () => {
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        
        // Reverse geocode to get city
        const response = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`
        );
        const data = await response.json();
        const detectedCity = data.city || data.locality || 'Global';
        setUserCity(detectedCity);
        localStorage.setItem('userCity', detectedCity);
        
        // Update socket
        if (socket) {
          socket.emit('register_user', {
            name: userName,
            age: userAge,
            gender: userGender,
            city: detectedCity
          });
        }
      } catch (error) {
        console.log('Location access denied');
      }
    }
  };
  
  const handleConnect = () => {
    if (!socket || !socket.connected) {
      toast.error('Connecting to server...');
      return;
    }
    
    setIsSearching(true);
    socket.emit('join_queue', { city: userCity });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (isSearching && !chatActive) {
        setIsSearching(false);
        toast.error('No users available. Try a different city.');
      }
    }, 30000);
  };
  
  const handleCitySelect = (city) => {
    setUserCity(city);
    localStorage.setItem('userCity', city);
    if (socket) {
      socket.emit('register_user', {
        name: userName,
        age: userAge,
        gender: userGender,
        city: city
      });
    }
  };
  
  const handleCloseChat = () => {
    setChatActive(false);
    setPartner(null);
    setIsSearching(false);
  };

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
            <h1 className="text-3xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }} data-testid="app-logo">stranger chat</h1>
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
        
        {/* Location */}
        <div className="px-6 mt-4">
          <div className="flex items-center gap-2 text-gray-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
            </svg>
            <span className="text-sm" data-testid="current-city">{userCity}</span>
            <span className="text-xs text-gray-500">• {stats.online} active</span>
          </div>
          
          {/* City chips */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide" data-testid="city-chips">
            {cities.map((city) => (
              <button
                key={city}
                onClick={() => handleCitySelect(city)}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all ${
                  city === userCity
                    ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
                data-testid={`city-chip-${city.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {city}
              </button>
            ))}
          </div>
        </div>
        
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
        
        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/90 backdrop-blur-lg border-t border-white/10">
          <div className="flex justify-around items-center h-16 max-w-2xl mx-auto px-6">
            <button
              onClick={() => navigate('/')}
              className="flex flex-col items-center gap-1 text-[#7c5cfc]"
              data-testid="nav-connect"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="12" r="3" fill="currentColor"/>
              </svg>
              <span className="text-xs">Connect</span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
              data-testid="nav-settings"
            >
              <SettingsIcon size={24} />
              <span className="text-xs">Settings</span>
            </button>
          </div>
        </nav>
      </div>
      
      {/* Chat Modal */}
      {chatActive && partner && socket && (
        <ChatModal
          socket={socket}
          partner={partner}
          onClose={handleCloseChat}
          onPhotoView={setPhotoToView}
        />
      )}
      
      {/* Photo Viewer */}
      {photoToView && (
        <PhotoViewer
          photo={photoToView}
          onClose={() => setPhotoToView(null)}
        />
      )}
    </div>
  );
};

export default Home;
