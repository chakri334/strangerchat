import { useMemo, useState } from 'react';
import { Mail, ArrowRight, UserRound } from 'lucide-react';
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

  /**
   * Start Google Sign-In flow using Emergent Auth.
   * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS
   */
  const handleGoogle = () => {
    setLoading(true);
    // Redirect to Emergent Auth with current origin as redirect
    const redirectUrl = window.location.origin + '/';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
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
          <button onClick={handleGoogle} disabled={loading} className="w-full py-3 rounded-2xl bg-white text-black font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50" data-testid="google-signin-button">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Redirecting...' : 'Continue with Google'}
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
