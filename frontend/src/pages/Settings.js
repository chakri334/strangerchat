import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import useSEO from '../hooks/useSEO';

const CITIES = [
  'Global','Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Kolkata','Pune','Ahmedabad',
  'New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio',
  'London','Manchester','Birmingham','Leeds','Glasgow',
  'Toronto','Vancouver','Montreal','Calgary',
  'Sydney','Melbourne','Brisbane','Perth',
  'Dubai','Abu Dhabi','Riyadh','Doha',
  'Singapore','Kuala Lumpur','Jakarta','Bangkok','Manila','Ho Chi Minh City',
  'Tokyo','Seoul','Shanghai','Beijing','Hong Kong',
  'Paris','Berlin','Madrid','Rome','Amsterdam','Brussels','Vienna','Stockholm',
  'São Paulo','Mexico City','Buenos Aires','Bogotá','Lima',
  'Lagos','Nairobi','Cairo','Johannesburg','Accra',
];

const Settings = () => {
  const navigate = useNavigate();
  const [name, setName]               = useState('');
  const [age, setAge]                 = useState('');
  const [gender, setGender]           = useState('');
  const [city, setCity]               = useState('Global');
  const [genderLocked, setGenderLocked] = useState(false);

  useSEO({
    title: 'Settings',
    description: 'Update your Stumble Chat display name, age, gender, and city preferences.',
    canonical: '/settings',
    noIndex: true,
  });

  useEffect(() => {
    setName(localStorage.getItem('userName') || '');
    setAge(localStorage.getItem('userAge') || '');
    setGender(localStorage.getItem('userGender') || '');
    setCity(localStorage.getItem('userCity') || 'Global');
    setGenderLocked(!!localStorage.getItem('userGender'));
  }, []);

  const handleSave = () => {
    if (!name.trim()) { toast.error('Please enter a display name'); return; }
    localStorage.setItem('userName', name.trim());
    localStorage.setItem('userAge', age);
    localStorage.setItem('userCity', city);
    if (!genderLocked && gender) {
      localStorage.setItem('userGender', gender);
      setGenderLocked(true);
      toast.success('Settings saved! Gender is now locked.');
    } else if (genderLocked) {
      toast.info('Gender is locked.');
    } else {
      toast.success('Settings saved!');
    }
    setTimeout(() => navigate('/'), 500);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20" data-testid="settings-page">
      <header className="p-6 flex items-center gap-4 border-b border-white/10">
        <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-white/5 transition-colors" data-testid="back-button">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Settings</h1>
      </header>

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Display Name */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Display Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7c5cfc] transition-all"
            data-testid="name-input" />
        </div>

        {/* Age */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Age (Optional)</label>
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Enter your age"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7c5cfc] transition-all"
            data-testid="age-input" />
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Gender {genderLocked && <span className="text-xs text-[#fc5c7d]">(Locked)</span>}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {['Male', 'Female', 'Other'].map((g) => (
              <button key={g} onClick={() => !genderLocked && setGender(g)} disabled={genderLocked}
                className={`py-3 rounded-xl font-medium transition-all ${gender === g ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'} ${genderLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {g}
              </button>
            ))}
          </div>
          {genderLocked && <p className="text-xs text-gray-500 mt-2">Gender can only be set once to maintain honest connections.</p>}
        </div>



        {/* Save */}
        <button onClick={handleSave} data-testid="save-button"
          className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] hover:opacity-90 transition-all">
          Save Settings
        </button>

        {/* Legal links */}
        <div className="pt-4 border-t border-white/10">
          <p className="text-xs text-gray-500 text-center mb-3">Legal</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Terms & Conditions', path: '/terms' },
              { label: 'Privacy Policy',     path: '/privacy' },
              { label: 'Cookie Policy',      path: '/cookies' },
              { label: 'Community Guidelines', path: '/guidelines' },
            ].map(({ label, path }) => (
              <button key={path} onClick={() => navigate(path)}
                className="py-2 px-3 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all text-left">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
