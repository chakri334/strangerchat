import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import { Toaster } from './components/ui/sonner';
import './App.css';

// Lazy load Settings — it's never needed on the homepage
// This shaves ~20-30 KiB from the initial JS bundle
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="top-center" />
    </div>
  );
}

export default App;
