import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * AuthCallback component handles the OAuth redirect from Emergent Auth.
 * It extracts the session_id from the URL fragment and exchanges it for a session.
 * 
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      try {
        // Extract session_id from URL fragment
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          console.error('No session_id in URL');
          navigate('/', { replace: true });
          return;
        }

        // Exchange session_id for user data
        const response = await fetch(`${BACKEND_URL}/api/auth/session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ session_id: sessionId }),
        });

        const data = await response.json();

        if (data.ok && data.user) {
          // Store user in localStorage for quick access
          localStorage.setItem('user', JSON.stringify(data.user));
          
          // Set authSession so AuthOnboarding recognizes user is authenticated
          const now = Date.now();
          localStorage.setItem('authSession', JSON.stringify({
            mode: 'google',
            createdAt: now,
            email: data.user.email,
            name: data.user.name,
            verified: true
          }));
          localStorage.setItem('authMethod', 'google');
          if (data.user.email) localStorage.setItem('accountEmail', data.user.email);
          if (data.user.name) localStorage.setItem('userName', data.user.name);
          
          // Clear the URL fragment and redirect to home
          window.history.replaceState({}, document.title, '/');
          navigate('/', { replace: true, state: { user: data.user } });
        } else {
          console.error('Auth failed:', data.message);
          navigate('/', { replace: true });
        }
      } catch (error) {
        console.error('Auth error:', error);
        navigate('/', { replace: true });
      }
    };

    processAuth();
  }, [navigate]);

  // Show minimal loading while processing
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] animate-pulse"></div>
        <p className="text-gray-400">Signing you in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
