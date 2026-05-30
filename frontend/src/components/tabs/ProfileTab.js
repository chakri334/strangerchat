import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, X, Plus, Copy, AtSign, Send, Camera, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiJSON, apiFetch } from '../../utils/api';

const GENDER_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const INTERESTED_IN_OPTIONS = [
  { value: '', label: 'Anyone' },
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'both', label: 'Both' },
];

const SUGGESTED_INTERESTS = ['music', 'gaming', 'movies', 'coding', 'art', 'travel', 'fitness', 'foodie', 'memes', 'books'];

const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
  </div>
);

const Pill = ({ active, disabled, children, onClick, testid }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-testid={testid}
    className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
      active
        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
        : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {children}
  </button>
);

const ProfileTab = ({ onSaved }) => {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState('');
  const [interestedIn, setInterestedIn] = useState('');
  const [interests, setInterests] = useState([]);
  const [newInterest, setNewInterest] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingPic, setUploadingPic] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    const { ok, data } = await apiJSON('/api/profile/me');
    if (!ok || !data?.ok || !data.profile) { setLoading(false); return; }
    const p = data.profile;
    setProfile(p);
    setName(p.name || '');
    setBio(p.bio || '');
    setGender(p.gender || '');
    setInterestedIn(p.interested_in || '');
    setInterests(p.interests || []);
    setTelegramId(p.telegram_id || '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addInterest = (tag) => {
    const clean = (tag || '').trim().toLowerCase();
    if (!clean) return;
    if (interests.includes(clean)) return;
    if (interests.length >= 10) { toast.error('Maximum 10 interests'); return; }
    setInterests([...interests, clean]);
    setNewInterest('');
  };
  const removeInterest = (tag) => setInterests(interests.filter((t) => t !== tag));

  const handleSave = async () => {
    setSaving(true);
    const { ok, data } = await apiJSON('/api/profile/me', {
      method: 'PUT',
      body: JSON.stringify({ name, bio, gender, interested_in: interestedIn, interests, telegram_id: telegramId }),
    });
    setSaving(false);
    if (!ok || !data?.ok) { toast.error(data?.message || 'Failed to save'); return; }
    setProfile(data.profile);
    if (name) localStorage.setItem('userName', name);
    toast.success('Profile saved');
    onSaved?.({ name, bio, gender, interestedIn, interests, telegramId });
  };

  const copyStumbleId = () => {
    if (!profile?.stumble_id) return;
    navigator.clipboard.writeText(profile.stumble_id);
    toast.success('Stumble ID copied');
  };

  const handlePictureChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast.error('JPEG, PNG, WebP or GIF only');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image too large (max 2MB)');
      return;
    }
    setUploadingPic(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch('/api/profile/picture', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    setUploadingPic(false);
    if (!res.ok || !data.ok) {
      toast.error(data.message || 'Upload failed');
      return;
    }
    setProfile((p) => ({ ...p, picture: data.picture }));
    toast.success('Picture updated');
  };

  const handleRemovePicture = async () => {
    if (!window.confirm('Remove your profile picture?')) return;
    const { ok } = await apiJSON('/api/profile/picture', { method: 'DELETE' });
    if (ok) {
      setProfile((p) => ({ ...p, picture: '' }));
      toast.success('Picture removed');
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center p-6"><div className="text-slate-400 text-sm">Loading profile…</div></div>;
  }
  if (!profile) {
    return <div className="flex-1 flex items-center justify-center p-6 text-center"><p className="text-sm text-slate-300">Sign in to edit your profile.</p></div>;
  }

  const genderLocked = profile.gender_locked;
  const isGoogle = profile.provider === 'google';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" data-testid="profile-tab">
      <div className="flex items-center gap-3">
        <div className="relative group">
          {profile.picture ? (
            <img src={profile.picture} alt={profile.name} className="h-16 w-16 rounded-2xl object-cover border border-slate-800" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 text-3xl shadow-lg shadow-emerald-500/10 select-none">
              😊
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPic}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-slate-950 hover:bg-emerald-400 border-2 border-slate-950 shadow-md disabled:opacity-50"
            data-testid="upload-picture-btn"
            title="Upload picture"
          >
            <Camera size={12} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handlePictureChange}
            className="hidden"
            data-testid="picture-file-input"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-white truncate" style={{ fontFamily: 'Syne, sans-serif' }}>
            {profile.name || 'Your profile'}
          </h2>
          <p className="text-[11px] text-slate-400 truncate">{profile.email}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-slate-500">Signed in via {profile.provider || 'email'}</p>
            {profile.picture && (
              <button
                onClick={handleRemovePicture}
                className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-0.5"
                data-testid="remove-picture-btn"
              >
                <Trash2 size={9} /> remove
              </button>
            )}
            {uploadingPic && <span className="text-[10px] text-emerald-400 animate-pulse">Uploading…</span>}
          </div>
        </div>
      </div>

      {profile.stumble_id && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-2">
          <AtSign size={14} className="text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold">Your Stumble ID</div>
            <div className="text-sm font-mono text-white truncate" data-testid="stumble-id-display">{profile.stumble_id}</div>
            <div className="text-[10px] text-slate-500">Share this so others can find you in People → Search.</div>
          </div>
          <button onClick={copyStumbleId} className="rounded-lg bg-slate-800 hover:bg-slate-700 p-1.5 text-emerald-300" data-testid="copy-stumble-id">
            <Copy size={12} />
          </button>
        </div>
      )}

      <Field label="Display name">
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
          placeholder="e.g. Cozy Panda"
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
          data-testid="profile-name-input"
        />
      </Field>

      <Field label="Bio">
        <textarea
          value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3}
          placeholder="Say something about yourself (280 chars max)"
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none resize-none"
          data-testid="profile-bio-input"
        />
        <p className="text-[10px] text-slate-500 text-right">{bio.length}/280</p>
      </Field>

      <Field
        label={`I am ${genderLocked ? '(locked)' : ''}`}
        hint={genderLocked ? 'Gender is locked for Google-signed-in accounts and cannot be changed.' : null}
      >
        <div className="flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((o) => (
            <Pill key={o.value || 'none'} active={gender === o.value} disabled={genderLocked && o.value !== gender} onClick={() => !genderLocked && setGender(o.value)} testid={`gender-${o.value || 'none'}`}>
              {o.label}
            </Pill>
          ))}
        </div>
      </Field>

      <Field label="Interested in">
        <div className="flex flex-wrap gap-2">
          {INTERESTED_IN_OPTIONS.map((o) => (
            <Pill key={o.value || 'any'} active={interestedIn === o.value} onClick={() => setInterestedIn(o.value)} testid={`interested-in-${o.value || 'any'}`}>
              {o.label}
            </Pill>
          ))}
        </div>
      </Field>

      <Field label={`Interests (${interests.length}/10)`}>
        <div className="flex flex-wrap gap-2 mb-2">
          {interests.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs px-3 py-1">
              #{tag}
              <button onClick={() => removeInterest(tag)} className="ml-0.5 hover:text-white" data-testid={`remove-interest-${tag}`}><X size={11} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text" value={newInterest} onChange={(e) => setNewInterest(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest(newInterest))}
            placeholder="Add an interest…"
            className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
            data-testid="add-interest-input"
          />
          <button type="button" onClick={() => addInterest(newInterest)} className="rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 px-3" data-testid="add-interest-btn">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SUGGESTED_INTERESTS.filter((s) => !interests.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => addInterest(s)} className="text-[10px] uppercase tracking-wider rounded-full border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 px-2 py-0.5">
              + {s}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Telegram link"
        hint="Optional: your Telegram username (e.g. @nick). Used by our bot for notifications and account linking."
      >
        <div className="relative">
          <Send className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sky-400" />
          <input
            type="text"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="@your_telegram_username"
            maxLength={64}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
            data-testid="telegram-id-input"
          />
        </div>
      </Field>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 text-sm font-bold py-3 uppercase tracking-wider transition-colors"
        data-testid="save-profile-btn"
      >
        <Save size={14} />
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  );
};

export default ProfileTab;
