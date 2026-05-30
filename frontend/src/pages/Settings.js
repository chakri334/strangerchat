import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban, Send, Save, AtSign, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import useSEO from '../hooks/useSEO';
import { apiJSON } from '../utils/api';

const Section = ({ title, hint, children }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</h3>
      {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
    {children}
  </div>
);

const Settings = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [telegramId, setTelegramId] = useState('');
  const [name, setName] = useState('');
  const [blocked, setBlocked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useSEO({
    title: 'Settings',
    description: 'Manage your Stumble Chat profile, Telegram link and blocked users.',
    canonical: '/settings',
    noIndex: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [profRes, blockedRes] = await Promise.all([
      apiJSON('/api/profile/me'),
      apiJSON('/api/blocked'),
    ]);
    if (profRes.ok && profRes.data?.profile) {
      const p = profRes.data.profile;
      setProfile(p);
      setName(p.name || '');
      setTelegramId(p.telegram_id || '');
    }
    if (blockedRes.ok && blockedRes.data?.users) {
      setBlocked(blockedRes.data.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    const { ok, data } = await apiJSON('/api/profile/me', {
      method: 'PUT',
      body: JSON.stringify({ name, telegram_id: telegramId }),
    });
    setSaving(false);
    if (!ok || !data?.ok) {
      toast.error(data?.message || 'Save failed');
      return;
    }
    setProfile(data.profile);
    if (name) localStorage.setItem('userName', name);
    toast.success('Settings saved');
  };

  const handleUnblock = async (userId) => {
    const { ok } = await apiJSON(`/api/block/${userId}`, { method: 'DELETE' });
    if (ok) {
      setBlocked((prev) => prev.filter((u) => u.user_id !== userId));
      toast.success('Unblocked');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12" data-testid="settings-page">
      <header className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-slate-800" data-testid="back-button">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Settings</h1>
      </header>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {loading && <div className="text-center py-12 text-slate-500 text-sm">Loading…</div>}

        {!loading && !profile && (
          <Section title="Not signed in">
            <p className="text-sm text-slate-300">Settings are only available for signed-in users. Guests can use Random Chat from the home page.</p>
          </Section>
        )}

        {!loading && profile && (
          <>
            <Section title="Identity">
              <div className="flex items-center gap-3">
                {profile.picture ? (
                  <img src={profile.picture} alt={profile.name} className="h-12 w-12 rounded-2xl object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 flex items-center justify-center text-xl">😊</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white truncate">{profile.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{profile.email}</div>
                  {profile.stumble_id && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono mt-1">
                      <AtSign size={10} />
                      <span data-testid="settings-stumble-id">{profile.stumble_id}</span>
                    </div>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Display name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                data-testid="settings-name-input"
              />
            </Section>

            <Section
              title="Telegram link"
              hint="Optional. Used by our bot for notifications and Telegram account linking."
            >
              <div className="relative">
                <Send className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sky-400" />
                <input
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  placeholder="@your_telegram_username"
                  maxLength={64}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                  data-testid="settings-telegram-id-input"
                />
              </div>
            </Section>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 font-bold py-3 text-xs uppercase tracking-wider"
              data-testid="settings-save-btn"
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>

            <Section
              title={`Blocked users (${blocked.length})`}
              hint="Blocked users can't message you. Unblock anyone here."
            >
              {blocked.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-center">
                  <div>
                    <Ban size={20} className="text-slate-600 mx-auto mb-2" />
                    <p className="text-[11px] text-slate-500">No one is blocked.</p>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2" data-testid="blocked-list">
                  {blocked.map((u) => (
                    <li key={u.user_id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-2.5">
                      {u.picture ? (
                        <img src={u.picture} alt={u.name} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-base">😶</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{u.name}</div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">{u.stumble_id}</div>
                      </div>
                      <button
                        onClick={() => handleUnblock(u.user_id)}
                        className="rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 px-3 py-1.5 text-[11px] font-bold uppercase"
                        data-testid={`unblock-${u.user_id}`}
                      >
                        Unblock
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}

        <Section title="Legal">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Terms & Conditions', path: '/terms' },
              { label: 'Privacy Policy', path: '/privacy' },
              { label: 'Cookie Policy', path: '/cookies' },
              { label: 'Community Guidelines', path: '/guidelines' },
            ].map(({ label, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="py-2 px-3 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg text-left border border-slate-800"
              >
                {label}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
};

export default Settings;
