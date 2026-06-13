import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, MapPin, Search, X, AtSign, Hand, Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiJSON } from '../../utils/api';
import AdUnlockModal from '../AdUnlockModal';

const InterestChip = ({ label }) => (
  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] uppercase tracking-wider px-2 py-0.5">
    #{label}
  </span>
);

const PersonCard = ({ user, waveState, onWave }) => {
  const ws = waveState[user.user_id] || 'idle'; // idle | sending | sent | matched

  return (
    <div
      className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900/50 p-3 hover:border-slate-700 hover:bg-slate-900 transition-all flex items-start gap-3"
      data-testid={`person-card-${user.user_id}`}
    >
      {/* Avatar */}
      {user.picture ? (
        <img src={user.picture} alt={user.name} className="h-12 w-12 rounded-2xl object-cover border border-slate-800 shrink-0" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#7c5cfc] to-[#fc5c7d] text-2xl select-none">
          {user.emoji || '😊'}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white truncate">{user.name}</h3>
          {user.distance_km !== undefined && (
            <span className="text-[10px] text-emerald-300 font-mono whitespace-nowrap">{user.distance_km} km</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
          {user.stumble_id && <span className="font-mono text-[#7c5cfc]">{user.stumble_id}</span>}
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

        {/* Action row */}
        <div className="flex items-center gap-2 mt-2.5">
          {/* Wave button */}
          {ws === 'idle' && (
            <button
              onClick={() => onWave(user.user_id, user.name)}
              className="flex items-center gap-1.5 rounded-lg bg-[#7c5cfc]/20 border border-[#7c5cfc]/40 text-[#a78bfa] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[#7c5cfc]/30 transition-all"
              data-testid={`wave-btn-${user.user_id}`}
            >
              <Hand size={11} />
              Wave 👋
            </button>
          )}
          {ws === 'sending' && (
            <button disabled className="flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 px-2.5 py-1.5 text-[11px] font-semibold">
              <Loader2 size={11} className="animate-spin" />
              Sending…
            </button>
          )}
          {ws === 'sent' && (
            <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1.5 text-[11px] font-semibold">
              👋 Wave sent!
            </span>
          )}
          {ws === 'matched' && (
            <span className="flex items-center gap-1.5 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 px-2.5 py-1.5 text-[11px] font-semibold animate-pulse">
              🎉 Mutual wave!
            </span>
          )}

          {/* Premium DM lock — always visible */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-500 px-2.5 py-1.5 text-[11px] cursor-not-allowed select-none"
            title="Direct Message · Coming soon for Premium users">
            <Lock size={10} />
            <span>DM</span>
            <span className="rounded-full bg-[#fc5c7d]/20 text-[#fc5c7d] text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider ml-0.5">
              Premium
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const askLocation = () => new Promise((resolve) => {
  if (!('geolocation' in navigator)) { resolve(null); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => resolve(null),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
  );
});

const PeopleTab = ({ onOpenChat, socket, sessionToken }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState(null);
  const [locationPrompted, setLocationPrompted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  // waveState: { [user_id]: 'idle' | 'sending' | 'sent' | 'matched' }
  const [waveState, setWaveState] = useState({});
  const [adModal, setAdModal] = useState(null); // { partnerId, partnerName, waveId } | null

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

  // Listen for wave_matched only (global wave_received toast lives in Home.js so it works across tabs).
  useEffect(() => {
    if (!socket) return;

    const onWaveMatched = ({ partner_id, user_b_id, wave_id }) => {
      const pid = partner_id || user_b_id;
      setWaveState(prev => ({ ...prev, [pid]: 'matched' }));
      const pName = users.find(u => u.user_id === pid)?.name || 'them';
      setAdModal({ partnerId: pid, partnerName: pName, waveId: wave_id || '' });
    };

    socket.on('wave_matched', onWaveMatched);
    return () => {
      socket.off('wave_matched', onWaveMatched);
    };
  }, [socket]);

  const handleWave = async (toUserId, toName) => {
    if (!sessionToken) {
      toast.error('Sign in to wave at people.');
      return;
    }
    setWaveState(prev => ({ ...prev, [toUserId]: 'sending' }));
    try {
      const { data } = await apiJSON('/api/waves/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ to_user_id: toUserId }),
      });
      if (data?.status === 'matched') {
        setWaveState(prev => ({ ...prev, [toUserId]: 'matched' }));
        setAdModal({ partnerId: toUserId, partnerName: toName, waveId: data.wave_id || '' });
      } else if (data?.ok) {
        setWaveState(prev => ({ ...prev, [toUserId]: 'sent' }));
        toast.success(`👋 Wave sent to ${toName}!`);
      } else {
        setWaveState(prev => ({ ...prev, [toUserId]: 'idle' }));
        toast.error(data?.message || 'Could not send wave.');
      }
    } catch {
      setWaveState(prev => ({ ...prev, [toUserId]: 'idle' }));
      toast.error('Failed to send wave. Try again.');
    }
  };

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
              className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-9 py-2.5 text-sm text-white placeholder-slate-600 focus:border-[#7c5cfc] focus:outline-none"
              data-testid="people-search-input"
            />
            {searchTerm && (
              <button type="button" onClick={() => { setSearchTerm(''); setSearchResult(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          <button type="submit" className="rounded-xl bg-[#7c5cfc] text-white px-3 py-2.5 hover:bg-[#6d4ef0]" data-testid="people-search-btn">
            <Search size={14} />
          </button>
        </form>

        {searchResult && (
          <div className="rounded-2xl border border-[#7c5cfc]/30 bg-[#7c5cfc]/5 p-3" data-testid="search-result">
            {searchResult.notFound ? (
              <div className="text-xs text-slate-300">
                No user found with that Stumble ID.
                <button onClick={() => setSearchResult(null)} className="ml-2 text-[#7c5cfc] underline">Clear</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {searchResult.picture ? (
                  <img src={searchResult.picture} className="h-10 w-10 rounded-xl object-cover" alt="" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-[#7c5cfc] to-[#fc5c7d] flex items-center justify-center text-lg">😊</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white truncate">{searchResult.name}</span>
                    <span className={`text-[9px] rounded-full px-1.5 py-0.5 ${searchResult.online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/40 text-slate-400'}`}>
                      {searchResult.online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-[#7c5cfc]">{searchResult.stumble_id}</div>
                  {searchResult.bio && <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{searchResult.bio}</p>}
                </div>
                <button
                  onClick={() => handleWave(searchResult.user_id, searchResult.name)}
                  className="rounded-lg bg-[#7c5cfc] text-white px-3 py-1.5 text-[11px] font-bold uppercase"
                  data-testid="wave-search-result"
                >
                  Wave 👋
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
              className="flex items-center gap-1 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-300 px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
              data-testid="enable-location-btn"
            >
              <MapPin size={11} />
              {locationPrompted ? 'Locating…' : 'Near me'}
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

      {/* Premium DM info banner */}
      <div className="mx-4 mb-2 rounded-xl bg-[#fc5c7d]/5 border border-[#fc5c7d]/20 px-3 py-2 flex items-center gap-2">
        <Lock size={11} className="text-[#fc5c7d] shrink-0" />
        <p className="text-[10px] text-slate-400">
          <span className="text-[#fc5c7d] font-semibold">Direct Message</span> is a Premium feature.
          Wave 👋 at someone — if they wave back, watch a short ad to unlock DM.
        </p>
      </div>

      {/* People list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-2" data-testid="people-list">
        {!loading && users.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center mb-3">
              <span className="text-2xl">🌎</span>
            </div>
            <p className="text-sm font-bold text-white">No one's online matching your preferences</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
              Switch to <span className="text-[#7c5cfc] font-semibold">Random Chat</span> to enter the global queue, or search by Stumble ID above.
            </p>
          </div>
        )}
        {users.map((u) => (
          <PersonCard
            key={u.user_id}
            user={u}
            waveState={waveState}
            onWave={handleWave}
          />
        ))}
      </div>
      {/* Ad Unlock Modal */}
      {adModal && (
        <AdUnlockModal
          open={!!adModal}
          onClose={() => setAdModal(null)}
          partnerName={adModal.partnerName}
          partnerId={adModal.partnerId}
          waveId={adModal.waveId}
          sessionToken={sessionToken}
          socket={socket}
          onUnlocked={(pid) => {
            setWaveState(prev => ({ ...prev, [pid]: 'unlocked' }));
            setAdModal(null);
          }}
        />
      )}
    </div>
  );
};

export default PeopleTab;
