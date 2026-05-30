import { MessageSquare, Radio, Users } from 'lucide-react';

const ChatsTabEmpty = ({ onGoMatch, onGoPeople }) => (
  <div className="flex flex-1 flex-col items-center justify-center p-6 text-center space-y-4" data-testid="chats-empty">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-emerald-400 shadow-xl shadow-emerald-500/5">
      <MessageSquare className="h-7 w-7" />
    </div>
    <div className="space-y-1 max-w-sm">
      <h3 className="text-sm font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>No Active Chats</h3>
      <p className="text-[11px] text-slate-400 leading-normal">
        You're not in a conversation. Drop into the global queue to match with the first available stranger, or pick someone from the directory.
      </p>
    </div>
    <div className="flex gap-2 pt-2">
      <button
        onClick={onGoMatch}
        className="flex items-center gap-1.5 rounded-xl bg-emerald-500 text-slate-950 font-bold px-4 py-2 text-xs uppercase tracking-wider hover:bg-emerald-400 transition-colors"
        data-testid="go-random-chat"
      >
        <Radio size={12} />
        Find someone
      </button>
      <button
        onClick={onGoPeople}
        className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 font-bold px-4 py-2 text-xs uppercase tracking-wider hover:text-white hover:bg-slate-800 transition-colors"
        data-testid="go-people"
      >
        <Users size={12} />
        Browse people
      </button>
    </div>
  </div>
);

export default ChatsTabEmpty;
