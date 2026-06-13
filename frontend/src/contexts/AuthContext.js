import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const USER_KEY = 'user';
const SESSION_TOKEN_KEY = 'session_token'; // sessionStorage only (cleared on tab close)
const IS_DEV = process.env.NODE_ENV === 'development';
const devLog = (...args) => { if (IS_DEV) console.warn(...args); };
const devErr = (...args) => { if (IS_DEV) console.error(...args); };

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

const readCachedUser = () => {
  // Hard-clear hygiene: only trust cached `user` when a sessionStorage token
  // exists (set on Google popup callback). Without it we cannot verify the
  // identity until /api/auth/me responds, so we MUST start from null to avoid
  // briefly rendering a previous session's name (e.g. on guest-mode visits).
  try {
    const hasToken = !!sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!hasToken) {
      localStorage.removeItem(USER_KEY);
      return null;
    }
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const clearAuthStorage = () => {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('authSession');
  localStorage.removeItem('authMethod');
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  // Migrate-away from old localStorage location, if any
  localStorage.removeItem(SESSION_TOKEN_KEY);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      // Prefer httpOnly cookie; fall back to legacy Bearer token (sessionStorage)
      const token = sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers,
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.user) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          return;
        }
      }

      // Auth failed → clear stale state
      setUser(null);
      clearAuthStorage();
    } catch (err) {
      devLog('Auth check failed, using cached user:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/google/start`, { credentials: 'include' });
      const data = await response.json();
      if (!data.ok || !data.auth_url) {
        devErr('Failed to start Google sign-in:', data.message);
        return;
      }
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(
        data.auth_url,
        'google-auth',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );
    } catch (err) {
      devErr('Google auth error:', err);
    }
  }, []);

  // Listen for messages from OAuth popup
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type !== 'google-auth-success' || !event.data?.user) return;
      const userData = event.data.user;
      setUser(userData);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      if (userData.session_token) {
        // Keep session_token in sessionStorage only as a fallback when cookies are blocked.
        sessionStorage.setItem(SESSION_TOKEN_KEY, userData.session_token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY);
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
    } catch (err) {
      devLog('Logout request failed:', err.message);
    } finally {
      setUser(null);
      clearAuthStorage();
    }
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    signInWithGoogle,
    logout,
    refreshAuth: checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
