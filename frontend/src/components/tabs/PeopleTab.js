import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, MapPin, Search, MessageSquarePlus, X, AtSign } from 'lucide-react';
import { toast } from 'sonner';
import { apiJSON } from '../../utils/api';

const InterestChip = ({ label }) => (
  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] uppercase tracking-wider px-2 py-0.5">
    #{label}
  </span>
);

const PersonCard = ({ user, onOpenChat }) => (
  <button
    type="button"
    onClick={() => onOpenChat(user)}
    className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900/50 p-3 hover:border-emerald-500/40 hover:bg-slate-900 transition-all flex items-start gap-3"
    data-testid={`person-card-${user.user_id || user.sid}`}
  >
    {user.picture ? (
      <img src={user.picture} alt={user.name} className="h-12 w-12 rounded-2xl object-cover border border-slate-800 shrink-0" />
    ) : (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 text-2xl select-none">
        {user.emoji || '😊'}
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white truncate">{user.name}</h3>
        {user.distance_km !== undefined && (
          <span className="text-[10px] text-emerald-300 font-mono whitespace-nowrap">{user.distance_km} km</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
        {user.stumble_id && <span className="font-mono text-emerald-400">{user.stumble_id}</span>}
        {user.city && user.city !== 'Global' && (
          <span className="flex items-center gap-0.5"><MapPin size={9} />{user.city}</span>
        )}
        {user.gender && <span className="uppercase">{user.gender}</span>}
      </div>
      {user.bio && <p className="text-[11px] text-slate-300 mt-1 line-clamp-1">{user.bio}</p>}
      {user.interests?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {user.interests.slice(0, 3).map((tag) => <InterestChip key={tag} label={tag} />)}
        </div>
      )}
    </div>
    <MessageSquarePlus size={16} className="text-emerald-400 mt-1 shrink-0" />
  </button>
);

const askLocation = () => new Promise((resolve) => {
  if (!('geolocation' in navigator)) { resolve(null); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => resolve(null),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
  );
});

const PeopleTab = ({ onOpenChat }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState(null);
  const [locationPrompted, setLocationPrompted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState(null);

  // `silent` skips the loading flicker for background polls and only spins the refresh icon.
  const fetchUsers = useCallback(async ({ silent } = { silent: false }) => {
    if (silent) setRefreshing(true); else setLoading(true);
    let path = '/api/active-users?city=Global';
    if (coords) path += `&lat=${coords.lat}&lng=${coords.lng}`;
    const { data } = await apiJSON(path);
    setUsers(data?.users || []);
    if (silent) setRefreshing(false); else setLoading(false);
  }, [coords]);

  useEffect(() => {
    fetchUsers({ silent: false });
    const t = setInterval(() => fetchUsers({ silent: true }), 8000);
    return () => clearInterval(t);
  }, [fetchUsers]);

  const enableLocation = async () => {
    setLocationPrompted(true);
    const c = await askLocation();
    if (c) {
      setCoords(c);
      toast.success('Distance sorting enabled');
    } else {
      toast.error('Location permission denied. Showing global list.');
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    const term = searchTerm.trim();
    if (!term) { setSearchResult(null); return; }
    const { data } = await apiJSON(`/api/users/search?stumble_id=${encodeURIComponent(term)}`);
    if (!data?.ok || !data.user) {
      setSearchResult({ notFound: true });
      return;
    }
    setSearchResult({ ...data.user, online: data.online });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search bar */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Stumble ID (e.g. @cozypanda1234)"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-9 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
              data-testid="people-search-input"
            />
            {searchTerm && (
              <button type="button" onClick={() => { setSearchTerm(''); setSearchResult(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          <button type="submit" className="rounded-xl bg-emerald-500 text-slate-950 px-3 py-2.5 hover:bg-emerald-400" data-testid="people-search-btn">
            <Search size={14} />
          </button>
        </form>

        {searchResult && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3" data-testid="search-result">
            {searchResult.notFound ? (
              <div className="text-xs text-slate-300">
                No user found with that Stumble ID.
                <button onClick={() => setSearchResult(null)} className="ml-2 text-emerald-400 underline">Clear</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {searchResult.picture ? (
                  <img src={searchResult.picture} className="h-10 w-10 rounded-xl object-cover" alt="" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 flex items-center justify-center text-lg">😊</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white truncate">{searchResult.name}</span>
                    <span className={`text-[9px] rounded-full px-1.5 py-0.5 ${searchResult.online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/40 text-slate-400'}`}>
                      {searchResult.online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-emerald-400">{searchResult.stumble_id}</div>
                  {searchResult.bio && <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{searchResult.bio}</p>}
                </div>
                <button
                  onClick={() => onOpenChat(searchResult)}
                  className="rounded-lg bg-emerald-500 text-slate-950 px-3 py-1.5 text-[11px] font-bold uppercase"
                  data-testid="message-search-result"
                >
                  Message
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="px-4 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>People</h2>
          <p className="text-[11px] text-slate-400">
            {loading ? 'Loading…' : `${users.length} online${coords ? ' · sorted by distance' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          {!coords && (
            <button
              onClick={enableLocation}
              disabled={locationPrompted}
              className="flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
              data-testid="enable-location-btn"
            >
              <MapPin size={11} />
              {locationPrompted ? 'Locating…' : 'Sort by distance'}
            </button>
          )}
          <button
            onClick={() => fetchUsers({ silent: false })}
            className="flex items-center gap-1 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 text-[11px] font-semibold"
            data-testid="refresh-people"
          >
            <RefreshCw size={11} className={(loading || refreshing) ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-2" data-testid="people-list">
        {!loading && users.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center mb-3">
              <span className="text-2xl">🌎</span>
            </div>
            <p className="text-sm font-bold text-white">No one's online matching your preferences</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
              We filter by your "Interested in" preference. Switch to <span className="text-emerald-400 font-semibold">Random Chat</span> to enter the global queue, or search by Stumble ID above.
            </p>
          </div>
        )}
        {users.map((u) => <PersonCard key={u.sid} user={u} onOpenChat={onOpenChat} />)}
      </div>
    </div>
  );
};

export default PeopleTab;
