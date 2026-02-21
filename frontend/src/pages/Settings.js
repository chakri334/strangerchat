import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { toast } from 'sonner';

const Settings = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [genderLocked, setGenderLocked] = useState(false);
  const [selectedCity, setSelectedCity] = useState('Global');
  const [expandedCountry, setExpandedCountry] = useState(null);
  
  const citiesByCountry = {
    'Global': ['Global'],
    'United States': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami'],
    'United Kingdom': ['London', 'Manchester', 'Birmingham', 'Edinburgh'],
    'India': ['Mumbai', 'Delhi', 'Bangalore', 'Kolkata', 'Chennai'],
    'Japan': ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama'],
    'Australia': ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
    'Canada': ['Toronto', 'Vancouver', 'Montreal', 'Calgary'],
    'Germany': ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'],
    'France': ['Paris', 'Lyon', 'Marseille', 'Toulouse'],
    'Brazil': ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador']
  };
  
  useEffect(() => {
    // Load saved data
    const savedName = localStorage.getItem('userName') || '';
    const savedAge = localStorage.getItem('userAge') || '';
    const savedGender = localStorage.getItem('userGender') || '';
    const savedCity = localStorage.getItem('userCity') || 'Global';
    const isGenderLocked = localStorage.getItem('genderLocked') === 'true';
    
    setName(savedName);
    setAge(savedAge);
    setGender(savedGender);
    setSelectedCity(savedCity);
    setGenderLocked(isGenderLocked);
  }, []);
  
  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Please enter a display name');
      return;
    }
    
    localStorage.setItem('userName', name);
    localStorage.setItem('userAge', age);
    localStorage.setItem('userCity', selectedCity);
    
    // Lock gender after first save if set
    if (gender && !genderLocked) {
      localStorage.setItem('userGender', gender);
      localStorage.setItem('genderLocked', 'true');
      setGenderLocked(true);
      toast.success('Settings saved! Gender is now locked.');
    } else {
      toast.success('Settings saved!');
    }
    
    setTimeout(() => navigate('/'), 500);
  };
  
  const toggleCountry = (country) => {
    setExpandedCountry(expandedCountry === country ? null : country);
  };
  
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20" data-testid="settings-page">
      {/* Header */}
      <header className="p-6 flex items-center gap-4 border-b border-white/10">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-full hover:bg-white/5 transition-colors"
          data-testid="back-button"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Settings</h1>
      </header>
      
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Display Name */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7c5cfc] transition-all"
            data-testid="name-input"
          />
        </div>
        
        {/* Age */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Age (Optional)</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Enter your age"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7c5cfc] transition-all"
            data-testid="age-input"
          />
        </div>
        
        {/* Gender */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Gender {genderLocked && <span className="text-xs text-[#fc5c7d]">(Locked)</span>}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {['Male', 'Female', 'Other'].map((g) => (
              <button
                key={g}
                onClick={() => !genderLocked && setGender(g)}
                disabled={genderLocked}
                className={`py-3 rounded-xl font-medium transition-all ${
                  gender === g
                    ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                } ${genderLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-testid={`gender-${g.toLowerCase()}`}
              >
                {g}
              </button>
            ))}
          </div>
          {genderLocked && (
            <p className="text-xs text-gray-500 mt-2">Gender cannot be changed once set</p>
          )}
        </div>
        
        {/* Location Switcher */}
        <div>
          <label className="block text-sm text-gray-400 mb-3">
            <MapPin size={16} className="inline mr-1" />
            Location
          </label>
          <div className="space-y-2" data-testid="location-switcher">
            {Object.entries(citiesByCountry).map(([country, cities]) => (
              <div key={country} className="border border-white/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleCountry(country)}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors flex justify-between items-center"
                  data-testid={`country-${country.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <span className="font-medium">{country}</span>
                  <svg
                    className={`w-5 h-5 transform transition-transform ${
                      expandedCountry === country ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {expandedCountry === country && (
                  <div className="bg-black/20 p-2 space-y-1">
                    {cities.map((city) => (
                      <button
                        key={city}
                        onClick={() => setSelectedCity(city)}
                        className={`w-full px-4 py-2 rounded-lg text-left transition-colors ${
                          selectedCity === city
                            ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white'
                            : 'hover:bg-white/5 text-gray-300'
                        }`}
                        data-testid={`city-${city.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {city}
                        {selectedCity === city && (
                          <span className="ml-2 text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Save Button */}
        <button
          onClick={handleSave}
          className="w-full py-4 bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-purple-500/20 transition-all"
          style={{ fontFamily: 'Syne, sans-serif' }}
          data-testid="save-button"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default Settings;
