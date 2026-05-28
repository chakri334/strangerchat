import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './contexts/AuthContext';
import './App.css';

// Lazy load all non-critical pages — excluded from initial bundle
const Settings = lazy(() => import('./pages/Settings'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const Guidelines = lazy(() => import('./pages/Guidelines'));

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
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
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="top-center" />
    </div>
  );
}

export default App;
