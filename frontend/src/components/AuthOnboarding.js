import { useState, useEffect } from 'react';
import { Mail, ArrowRight, UserRound } from 'lucide-react';
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
              <button onClick={handleSendOtp} disabled={loading} data-testid="email-send-otp-btn" className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">{loading ? 'Sending...' : (<>Continue with Email <ArrowRight size={16} /></>)}</button>
            ) : (
              <>
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit OTP" data-testid="email-otp-input" className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-3 outline-none focus:ring-2 focus:ring-[#7c5cfc]" />
                <button onClick={handleVerifyOtp} disabled={loading} data-testid="email-verify-otp-btn" className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] font-semibold disabled:opacity-50">{loading ? 'Verifying...' : 'Verify OTP'}</button>
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
