import { Radio, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AppHeader = ({ profile, isConnected, isAuthenticated, onLogout }) => {
  const navigate = useNavigate();
  return (
    <header
      className="sticky top-0 z-30 w-full border-b border-slate-800 bg-slate-900/90 backdrop-blur-md"
      data-testid="app-header"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 text-white shadow shadow-emerald-500/10">
            <Radio className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1
                className="text-base font-bold tracking-tight text-white"
                style={{ fontFamily: 'Syne, sans-serif' }}
                data-testid="app-logo"
              >
                Stumble Chat
              </h1>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              }`}>
                {isConnected ? 'Live' : 'Connecting'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {profile?.name && (
            <div className="hidden sm:flex items-center gap-2 rounded-lg bg-slate-800/60 px-2.5 py-1 border border-slate-700/60">
              <span className="text-base select-none">{profile.avatar || '😊'}</span>
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">
                {profile.name}
              </span>
            </div>
          )}
          <button
            onClick={() => navigate('/settings')}
            className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors"
            title="Settings"
            data-testid="settings-button"
          >
            <SettingsIcon size={16} className="text-slate-300" />
          </button>
          {isAuthenticated && (
            <button
              onClick={onLogout}
              className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors"
              title="Sign out"
              data-testid="logout-button"
            >
              <LogOut size={16} className="text-slate-300" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
