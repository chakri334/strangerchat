import { useState, useEffect, useCallback } from 'react';
import { Save, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

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
  { value: 'both', label: 'Everyone' },
];

const SUGGESTED_INTERESTS = ['music', 'gaming', 'movies', 'coding', 'art', 'travel', 'fitness', 'foodie', 'memes', 'books'];

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</label>
    {children}
  </div>
);

const Pill = ({ active, children, onClick, testid }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testid}
    className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
      active
        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
        : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
    }`}
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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/profile/me`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok || !data.profile) return;
      const p = data.profile;
      setProfile(p);
      setName(p.name || '');
      setBio(p.bio || '');
      setGender(p.gender || '');
      setInterestedIn(p.interested_in || '');
      setInterests(p.interests || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addInterest = (tag) => {
    const clean = (tag || '').trim().toLowerCase();
    if (!clean) return;
    if (interests.includes(clean)) return;
    if (interests.length >= 10) {
      toast.error('Maximum 10 interests');
      return;
    }
    setInterests([...interests, clean]);
    setNewInterest('');
  };

  const removeInterest = (tag) => setInterests(interests.filter((t) => t !== tag));

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = sessionStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/profile/me`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name,
          bio,
          gender,
          interested_in: interestedIn,
          interests,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.message || 'Failed to save');
        return;
      }
      setProfile(data.profile);
      if (name) localStorage.setItem('userName', name);
      toast.success('Profile saved');
      onSaved?.({ name, bio, gender, interestedIn, interests });
    } catch (e) {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-slate-400 text-sm">Loading profile…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-slate-300">Sign in to edit your profile.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" data-testid="profile-tab">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 text-3xl shadow-lg shadow-emerald-500/10 select-none">
          😊
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-white truncate" style={{ fontFamily: 'Syne, sans-serif' }}>
            {profile.name || 'Your profile'}
          </h2>
          <p className="text-[11px] text-slate-400 truncate">{profile.email}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Signed in via {profile.provider || 'email'}</p>
        </div>
      </div>

      <Field label="Display name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. Cozy Panda"
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
          data-testid="profile-name-input"
        />
      </Field>

      <Field label="Bio">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Say something about yourself (280 chars max)"
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors resize-none"
          data-testid="profile-bio-input"
        />
        <p className="text-[10px] text-slate-500 text-right">{bio.length}/280</p>
      </Field>

      <Field label="I am">
        <div className="flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((o) => (
            <Pill
              key={o.value || 'none'}
              active={gender === o.value}
              onClick={() => setGender(o.value)}
              testid={`gender-${o.value || 'none'}`}
            >
              {o.label}
            </Pill>
          ))}
        </div>
      </Field>

      <Field label="Interested in">
        <div className="flex flex-wrap gap-2">
          {INTERESTED_IN_OPTIONS.map((o) => (
            <Pill
              key={o.value || 'any'}
              active={interestedIn === o.value}
              onClick={() => setInterestedIn(o.value)}
              testid={`interested-in-${o.value || 'any'}`}
            >
              {o.label}
            </Pill>
          ))}
        </div>
      </Field>

      <Field label={`Interests (${interests.length}/10)`}>
        <div className="flex flex-wrap gap-2 mb-2">
          {interests.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs px-3 py-1"
            >
              #{tag}
              <button
                onClick={() => removeInterest(tag)}
                className="ml-0.5 hover:text-white"
                data-testid={`remove-interest-${tag}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newInterest}
            onChange={(e) => setNewInterest(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest(newInterest))}
            placeholder="Add an interest…"
            className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
            data-testid="add-interest-input"
          />
          <button
            type="button"
            onClick={() => addInterest(newInterest)}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 px-3 transition-colors"
            data-testid="add-interest-btn"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SUGGESTED_INTERESTS.filter((s) => !interests.includes(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addInterest(s)}
              className="text-[10px] uppercase tracking-wider rounded-full border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-700 px-2 py-0.5 transition-colors"
            >
              + {s}
            </button>
          ))}
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
