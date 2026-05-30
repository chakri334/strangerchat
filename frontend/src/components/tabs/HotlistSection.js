import { useEffect, useState, useCallback } from 'react';
import { Pin, MessageSquare } from 'lucide-react';
import { apiJSON } from '../../utils/api';

const HotlistSection = ({ onOpenChat, refreshKey = 0 }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await apiJSON('/api/hotlist');
    setItems(data?.users || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3" data-testid="hotlist-section">
      <div className="flex items-center gap-2">
        <Pin size={14} className="text-emerald-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
          Hotlist · {items.length} pinned
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          Pin people from inside a chat to keep their conversation forever (skips the 7-day auto-flush).
        </p>
      ) : (
        <ul className="space-y-2" data-testid="hotlist-list">
          {items.map((u) => (
            <li key={u.user_id}>
              <button
                type="button"
                onClick={() => onOpenChat(u)}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-2.5 hover:bg-slate-900 transition-colors text-left"
                data-testid={`hotlist-row-${u.user_id}`}
              >
                {u.picture ? (
                  <img src={u.picture} alt={u.name} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 flex items-center justify-center text-base">😊</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-white truncate">{u.name}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${u.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  </div>
                  <div className="text-[10px] font-mono text-emerald-400 truncate">{u.stumble_id}</div>
                  {u.bio && <div className="text-[10px] text-slate-500 truncate">{u.bio}</div>}
                </div>
                <MessageSquare size={14} className="text-slate-400 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HotlistSection;
