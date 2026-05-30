import { Radio, Sparkles } from 'lucide-react';

const RandomChatTab = ({ isConnected, isSearching, onConnect, stats }) => (
  <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 relative overflow-hidden" data-testid="random-chat-tab">
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#7c5cfc] opacity-10 blur-[120px] rounded-full" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-emerald-500 opacity-10 blur-[100px] rounded-full" />
    </div>

    <div className="relative z-10 text-center space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
          <Sparkles size={10} />
          {stats.online > 0 ? `${stats.online} online now` : 'Anonymous · Free · No signup needed'}
        </div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
          Find your next conversation
        </h1>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          Tap connect to enter the global queue. We'll match you with the first available stranger ready to chat.
        </p>
      </div>

      <div className="relative inline-block">
        {isSearching && (
          <div className="absolute inset-0 animate-ping">
            <div className="w-56 h-56 rounded-full bg-gradient-to-r from-[#7c5cfc] to-emerald-400 opacity-30" />
          </div>
        )}
        <button
          onClick={onConnect}
          disabled={isSearching || !isConnected}
          className={`relative w-56 h-56 rounded-full bg-gradient-to-br from-[#7c5cfc] via-emerald-400 to-emerald-500 shadow-2xl shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${!isConnected ? 'opacity-50' : ''}`}
          data-testid="connect-button"
        >
          <span className="flex flex-col items-center gap-2">
            <Radio className={`h-8 w-8 text-white ${isSearching ? 'animate-pulse' : ''}`} />
            <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
              {!isConnected ? 'Loading…' : isSearching ? 'Searching…' : 'Connect'}
            </span>
          </span>
        </button>
      </div>

      {isSearching && (
        <p className="text-slate-400 text-sm animate-pulse" data-testid="searching-text">
          Looking for someone interesting…
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center" data-testid="stat-online">
          <div className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.online}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Online</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center" data-testid="stat-chats">
          <div className="text-lg font-bold text-[#7c5cfc]" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.chats_today}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Chats Today</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center" data-testid="stat-cities">
          <div className="text-lg font-bold text-sky-400" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.cities}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Cities</div>
        </div>
      </div>
    </div>
  </div>
);

export default RandomChatTab;
