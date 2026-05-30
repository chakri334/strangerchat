import { useState, useEffect } from 'react';
import { Mail, ArrowRight, UserRound, Radio, Sparkles, Shield } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const AuthOnboarding = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  // Listen for messages from OAuth popup
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'google-auth-success' && event.data?.user) {
        const user = event.data.user;
        // Store non-sensitive user data
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('authSession', JSON.stringify({
          mode: 'google',
          createdAt: Date.now(),
          email: user.email,
          name: user.name,
          verified: true,
        }));
        localStorage.setItem('authMethod', 'google');
        if (user.email) localStorage.setItem('accountEmail', user.email);
        if (user.name) localStorage.setItem('userName', user.name);
        // Auth token kept in sessionStorage only (cleared on tab close); httpOnly cookie is primary
        if (user.session_token) sessionStorage.setItem('session_token', user.session_token);

        toast.success(`Welcome, ${user.name || 'User'}!`);
        setLoading(false);
        onAuthenticated();
      } else if (event.data?.type === 'google-auth-error') {
        toast.error(event.data.message || 'Google sign-in failed');
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthenticated]);

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
   * Start Google Sign-In flow using popup window
   */
  const handleGoogle = async () => {
    setLoading(true);
    
    try {
      // Get OAuth URL from backend
      const response = await fetch(`${BACKEND_URL}/api/auth/google/start`);
      const data = await response.json();
      
      if (!data.ok || !data.auth_url) {
        toast.error(data.message || 'Failed to start Google sign-in');
        setLoading(false);
        return;
      }
      
      // Open popup for Google OAuth
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        data.auth_url,
        'google-auth',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );
      
      // Check if popup was blocked
      if (!popup) {
        toast.error('Popup blocked. Please allow popups for this site.');
        setLoading(false);
        return;
      }
      
      // Poll to detect when popup closes (fallback if postMessage fails)
      const checkPopup = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopup);
          setLoading(false);
        }
      }, 500);
      
    } catch (error) {
      console.error('Google auth error:', error);
      toast.error('Failed to start Google sign-in');
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      toast.error('Enter a valid email');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/email/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.message || 'Failed to send OTP');
        return;
      }
      setOtpStep(true);
      // DEV ONLY: show OTP for demo testing. Remove when email delivery is wired.
      if (data.dev_code) {
        toast.success(`OTP sent (demo): ${data.dev_code}`);
      } else {
        toast.success('OTP sent to your email');
      }
    } catch (e) {
      console.error('send-otp error:', e);
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const normalized = email.trim().toLowerCase();
    const code = (otp || '').trim();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/email/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: normalized, code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.message || 'Invalid code');
        return;
      }
      const user = data.user;
      localStorage.setItem('user', JSON.stringify(user));
      if (user.session_token) sessionStorage.setItem('session_token', user.session_token);
      if (user.name) localStorage.setItem('userName', user.name);
      toast.success('Email verified');
      finishSession('email', { email: user.email, name: user.name, verified: true });
    } catch (e) {
      console.error('verify-otp error:', e);
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    finishSession('guest', { guestMessageCount: 0, verified: false });
    toast.success('Continuing as guest');
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(16,185,129,0.06),transparent)] pointer-events-none" />

      <div className="relative w-full max-w-md p-6 rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-2xl space-y-7">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 text-white shadow-xl shadow-emerald-500/10">
            <Radio className="h-7 w-7 animate-pulse text-white" />
            <div className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-400 p-1 block shadow">
              <Sparkles className="h-3 w-3 text-slate-950" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
              Stumble Chat
            </h1>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Meet new people, talk with strangers, swap interests. No phone number or credit card required.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-2xl bg-white text-slate-950 hover:bg-slate-100 transition-all font-semibold text-xs uppercase tracking-wider py-3.5 shadow-lg shadow-white/5 active:scale-95 disabled:opacity-50"
            data-testid="google-signin-button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? 'Redirecting…' : 'Sign in with Google'}
          </button>

          <div className="flex items-center gap-3 text-[10px] uppercase font-mono font-bold text-slate-600">
            <div className="h-px bg-slate-800 flex-1" />
            Or continue with email
            <div className="h-px bg-slate-800 flex-1" />
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-600" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Email address…"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-3 py-3 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </div>
            {!otpStep ? (
              <button
                onClick={handleSendOtp}
                disabled={loading}
                data-testid="email-send-otp-btn"
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-bold py-3 transition-colors uppercase tracking-wider disabled:opacity-50"
              >
                {loading ? 'Sending…' : (<>Continue with Email <ArrowRight className="h-3.5 w-3.5" /></>)}
              </button>
            ) : (
              <>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  data-testid="email-otp-input"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors tracking-widest text-center"
                />
                <button
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  data-testid="email-verify-otp-btn"
                  className="w-full rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-bold py-3 transition-colors uppercase tracking-wider disabled:opacity-50"
                >
                  {loading ? 'Verifying…' : 'Verify OTP'}
                </button>
              </>
            )}
          </div>

          <button
            onClick={handleGuest}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white transition-all font-semibold text-xs uppercase tracking-wider py-3.5 border border-slate-800 active:scale-95"
          >
            <UserRound className="h-4 w-4 text-emerald-400" />
            Continue as Guest
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex gap-2.5">
            <Shield className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-slate-300">Privacy First</h4>
              <p className="text-[10px] text-slate-500 leading-normal">
                Anonymous chat is the default. Credentials only sync your nickname and avatar — conversations remain ephemeral and disappearing photos delete for both sides.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-600 font-mono">
          By continuing you agree to Terms, Privacy and Community Safety
        </p>
      </div>
    </div>
  );
};

export default AuthOnboarding;
