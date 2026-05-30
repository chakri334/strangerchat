import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Radio, Users, Pin } from 'lucide-react';
import { apiJSON } from '../../utils/api';

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const ConversationRow = ({ conv, onOpen }) => {
  const lm = conv.last_message;
  const preview = lm.deleted_for_everyone
    ? 'This message was deleted'
    : (lm.text || (lm.has_photo ? '📷 Photo' : ''));
  return (
    <button
      type="button"
      onClick={() => onOpen(conv.peer)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-900/60 transition-colors text-left"
      data-testid={`conv-row-${conv.peer.user_id}`}
    >
      {conv.peer.picture ? (
        <img src={conv.peer.picture} alt={conv.peer.name} className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 flex items-center justify-center text-xl shrink-0">😊</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-white truncate flex-1">{conv.peer.name}</span>
          {conv.pinned && <Pin size={10} className="text-emerald-400 shrink-0" />}
          <span className="text-[10px] text-slate-500 shrink-0">{formatTime(lm.created_at)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className={`text-xs truncate flex-1 ${conv.unread_count > 0 ? 'text-white font-medium' : 'text-slate-400'}`}>
            {preview}
          </p>
          {conv.unread_count > 0 && (
            <span className="rounded-full bg-emerald-500 text-slate-950 text-[10px] font-bold px-1.5 min-w-[18px] text-center" data-testid={`unread-${conv.peer.user_id}`}>
              {conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

const EmptyState = ({ onGoMatch, onGoPeople }) => (
  <div className="flex flex-1 flex-col items-center justify-center p-6 text-center space-y-4" data-testid="chats-empty">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-emerald-400 shadow-xl shadow-emerald-500/5">
      <MessageSquare className="h-7 w-7" />
    </div>
    <div className="space-y-1 max-w-sm">
      <h3 className="text-sm font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>No Active Chats</h3>
      <p className="text-[11px] text-slate-400 leading-normal">
        Pick someone from People to start a saved conversation. Random Chat messages stay anonymous and aren't saved.
      </p>
    </div>
    <div className="flex gap-2 pt-2">
      <button onClick={onGoMatch} className="flex items-center gap-1.5 rounded-xl bg-emerald-500 text-slate-950 font-bold px-4 py-2 text-xs uppercase tracking-wider hover:bg-emerald-400" data-testid="go-random-chat">
        <Radio size={12} /> Find someone
      </button>
      <button onClick={onGoPeople} className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 font-bold px-4 py-2 text-xs uppercase tracking-wider hover:text-white hover:bg-slate-800" data-testid="go-people">
        <Users size={12} /> Browse people
      </button>
    </div>
  </div>
);

const ChatsTab = ({ onOpenChat, onGoMatch, onGoPeople, refreshKey = 0 }) => {
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await apiJSON('/api/conversations');
    setConvs(data?.conversations || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  if (loading && convs.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">Loading chats…</div>;
  }
  if (convs.length === 0) {
    return <EmptyState onGoMatch={onGoMatch} onGoPeople={onGoPeople} />;
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-slate-900" data-testid="chats-list">
      {convs.map((c) => <ConversationRow key={c.conv_id} conv={c} onOpen={onOpenChat} />)}
    </div>
  );
};

export default ChatsTab;
