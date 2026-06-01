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
      <h2 style={{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap'}}>Chat with Strangers Instantly – No Sign Up Required</h2>
      <h2 style={{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap'}}>Meet New People from India and Around the World</h2>
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
      <Toaster position="bottom-center" closeButton offset={80} mobileOffset={88} />
    </div>
  );
}

export default App;
