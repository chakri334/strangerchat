import { useMemo, useState } from 'react';
import { Mail, ArrowRight, Chrome, UserRound } from 'lucide-react';
import { toast } from 'sonner';

const OTP_TTL_MS = 5 * 60 * 1000;

const AuthOnboarding = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const otpMeta = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('otpMeta') || '{}');
    } catch {
      return {};
    }
  }, [otpStep]);

  const finishSession = (mode, identity = {}) => {
    const now = Date.now();
    localStorage.setItem('authSession', JSON.stringify({ mode, createdAt: now, ...identity }));
    localStorage.setItem('authMethod', mode === 'guest' ? 'guest' : mode === 'google' ? 'google' : 'email');
    if (identity.email) localStorage.setItem('accountEmail', identity.email);
    if (!localStorage.getItem('userName')) {
      localStorage.setItem('userName', mode === 'guest' ? `Guest${Math.floor(Math.random() * 9000 + 1000)}` : `User${Math.floor(Math.random() * 9000 + 1000)}`);
    }
    onAuthenticated();
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backendUrl}/api/auth/google/start`);
      const data = await res.json();
      if (!data.ok || !data.auth_url) {
        throw new Error(data.message || 'Google sign-in unavailable');
      }
      const popup = window.open(data.auth_url, 'google_oauth_popup', 'width=520,height=680,noopener,noreferrer');
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups and retry.');
      }
      const onMessage = (event) => {
        if (event.origin !== new URL(backendUrl).origin) return;
        if (event.data?.type === 'google-auth-success') {
          const session = event.data.session || {};
          finishSession('google', { email: session.email, verified: true });
          if (session.name && !localStorage.getItem('userName')) localStorage.setItem('userName', session.name);
          if (session.avatar) localStorage.setItem('userAvatar', session.avatar);
          toast.success('Signed in with Google');
          window.removeEventListener('message', onMessage);
          setLoading(false);
        }
        if (event.data?.type === 'google-auth-error') {
          toast.error(event.data.message || 'Google authentication failed');
          window.removeEventListener('message', onMessage);
          setLoading(false);
        }
      };
      window.addEventListener('message', onMessage);
      const popupWatcher = setInterval(() => {
        if (popup.closed) {
          clearInterval(popupWatcher);
          window.removeEventListener('message', onMessage);
          setLoading(false);
        }
      }, 500);
    } catch (err) {
      toast.error(err.message || 'Google authentication failed');
      setLoading(false);
    }
  };

  const handleSendOtp = () => {
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      toast.error('Enter a valid email');
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    localStorage.setItem('otpMeta', JSON.stringify({ email: normalized, code, expiresAt: Date.now() + OTP_TTL_MS }));
    setOtpStep(true);
    toast.success('OTP sent (demo mode)');
  };

  const handleVerifyOtp = () => {
    const meta = otpMeta || {};
    if (!meta.code || !meta.expiresAt || Date.now() > meta.expiresAt) {
      toast.error('OTP expired. Request a new one.');
      return;
    }
    if ((otp || '').trim() !== String(meta.code)) {
      toast.error('Invalid OTP');
      return;
    }
    localStorage.removeItem('otpMeta');
    finishSession('email', { email: meta.email, verified: true });
    toast.success('Email verified');
  };

  const handleGuest = () => {
    finishSession('guest', { guestMessageCount: 0, verified: false });
    toast.success('Continuing as guest');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-5 py-10">
      <div className="max-w-md mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-5">
            <span className="text-sm">✨</span><span className="text-sm text-gray-300">StumbleChat</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>Meet nearby people instantly</h1>
          <p className="text-gray-400 mt-3">Chat, discover, and connect safely</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-purple-900/10 space-y-4">
          <button onClick={handleGoogle} disabled={loading} className="w-full py-3 rounded-2xl bg-white text-black font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
            <Chrome size={18} /> Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs text-gray-500"><div className="h-px bg-white/10 flex-1" />OR<div className="h-px bg-white/10 flex-1" /></div>

          <div className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email address" className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-3 outline-none focus:ring-2 focus:ring-[#7c5cfc]" />
            </div>
            {!otpStep ? (
              <button onClick={handleSendOtp} className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] font-semibold flex items-center justify-center gap-2">Continue with Email <ArrowRight size={16} /></button>
            ) : (
              <>
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit OTP" className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-3 outline-none focus:ring-2 focus:ring-[#7c5cfc]" />
                <button onClick={handleVerifyOtp} className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] font-semibold">Verify OTP</button>
              </>
            )}
          </div>

          <button onClick={handleGuest} className="w-full py-3 rounded-2xl border border-white/15 bg-white/5 font-medium text-gray-200 flex items-center justify-center gap-2"><UserRound size={16} /> Continue as Guest</button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-5">By continuing, you agree to Terms, Privacy, and Community Safety policies.</p>
      </div>
    </div>
  );
};

export default AuthOnboarding;
