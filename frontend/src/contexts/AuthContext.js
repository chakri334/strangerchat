import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      // Check localStorage first for quick load
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }

      // Verify with backend using session token
      const sessionToken = localStorage.getItem('session_token');
      if (sessionToken) {
        const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${sessionToken}`
          },
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.user) {
            setUser(data.user);
            localStorage.setItem('user', JSON.stringify(data.user));
          } else {
            setUser(null);
            localStorage.removeItem('user');
            localStorage.removeItem('session_token');
          }
        } else {
          setUser(null);
          localStorage.removeItem('user');
          localStorage.removeItem('session_token');
        }
      }
    } catch (error) {
      // Keep localStorage user if backend is unreachable
      console.warn('Auth check failed, using cached user:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /**
   * Start Google Sign-In flow using popup
   */
  const signInWithGoogle = async () => {
    try {
      // Get OAuth URL from backend
      const response = await fetch(`${BACKEND_URL}/api/auth/google/start`);
      const data = await response.json();
      
      if (!data.ok || !data.auth_url) {
        console.error('Failed to start Google sign-in:', data.message);
        return;
      }
      
      // Open popup for Google OAuth
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(
        data.auth_url,
        'google-auth',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );
    } catch (error) {
      console.error('Google auth error:', error);
    }
  };

  // Listen for messages from OAuth popup
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'google-auth-success' && event.data?.user) {
        const userData = event.data.user;
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        if (userData.session_token) {
          localStorage.setItem('session_token', userData.session_token);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const logout = async () => {
    try {
      const sessionToken = localStorage.getItem('session_token');
      if (sessionToken) {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`
          },
          credentials: 'include',
        });
      }
    } catch (error) {
      // Log but don't block logout if server is unreachable
      console.warn('Logout request failed:', error.message);
    } finally {
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('session_token');
      localStorage.removeItem('authSession');
      localStorage.removeItem('authMethod');
    }
  };

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
