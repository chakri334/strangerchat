import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './contexts/AuthContext';
import AuthCallback from './components/AuthCallback';
import './App.css';

// Lazy load all non-critical pages — excluded from initial bundle
const Settings = lazy(() => import('./pages/Settings'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const Guidelines = lazy(() => import('./pages/Guidelines'));

// AppRouter handles auth callback detection synchronously
function AppRouter() {
  const location = useLocation();
  
  // Check URL fragment for session_id (OAuth callback) - MUST be synchronous
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/cookies" element={<CookiePolicy />} />
        <Route path="/guidelines" element={<Guidelines />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="top-center" />
    </div>
  );
}

export default App;
