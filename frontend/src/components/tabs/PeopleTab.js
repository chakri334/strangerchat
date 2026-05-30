import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, MapPin, Sparkles, Send } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const InterestChip = ({ label }) => (
  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] uppercase tracking-wider px-2 py-0.5">
    #{label}
  </span>
);

const PersonCard = ({ user, onConnect }) => (
  <div
    className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 hover:border-emerald-500/40 hover:bg-slate-900 transition-all"
    data-testid={`person-card-${user.sid}`}
  >
    <div className="flex items-start gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 text-2xl shadow-lg shadow-emerald-500/10 select-none">
        {user.emoji || '😊'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white truncate">{user.name}</h3>
          {user.gender && (
            <span className="text-[9px] uppercase font-mono text-slate-500 tracking-wider">{user.gender}</span>
          )}
        </div>
        {user.city && user.city !== 'Global' && (
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-400">
            <MapPin size={10} />
            <span>{user.city}</span>
          </div>
        )}
        {user.bio && (
          <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed line-clamp-2">{user.bio}</p>
        )}
        {user.interests?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {user.interests.slice(0, 4).map((tag) => <InterestChip key={tag} label={tag} />)}
          </div>
        )}
      </div>
    </div>
    <button
      onClick={() => onConnect(user.sid)}
      className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-bold py-2 transition-colors uppercase tracking-wider"
      data-testid={`connect-direct-${user.sid}`}
    >
      <Send size={12} /> Connect Directly
    </button>
  </div>
);

const PeopleTab = ({ onDirectConnect, myInterests = [] }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterByInterests, setFilterByInterests] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${BACKEND_URL}/api/active-users?city=Global`;
      if (filterByInterests && myInterests.length > 0) {
        url += `&interests=${encodeURIComponent(myInterests.join(','))}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [filterByInterests, myInterests]);

  useEffect(() => {
    fetchUsers();
    const t = setInterval(fetchUsers, 8000);
    return () => clearInterval(t);
  }, [fetchUsers]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            People online
          </h2>
          <p className="text-[11px] text-slate-400">
            {loading ? 'Loading directory…' : `${users.length} stranger${users.length === 1 ? '' : 's'} ready to chat`}
          </p>
        </div>
        <div className="flex gap-2">
          {myInterests.length > 0 && (
            <button
              onClick={() => setFilterByInterests((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-colors ${
                filterByInterests
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:text-white'
              }`}
              data-testid="filter-interests-toggle"
            >
              <Sparkles size={12} />
              My interests
            </button>
          )}
          <button
            onClick={fetchUsers}
            className="flex items-center gap-1 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
            data-testid="refresh-people"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-3" data-testid="people-list">
        {!loading && users.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center mb-3">
              <span className="text-2xl">🌎</span>
            </div>
            <p className="text-sm font-bold text-white">No one's around right now</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
              Try the <span className="text-emerald-400 font-semibold">Random Chat</span> tab to enter the global queue and match with the first available stranger.
            </p>
          </div>
        )}
        {users.map((u) => (
          <PersonCard key={u.sid} user={u} onConnect={onDirectConnect} />
        ))}
      </div>
    </div>
  );
};

export default PeopleTab;
