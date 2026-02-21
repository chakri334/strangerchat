import { X } from 'lucide-react';

const WaitingPage = ({ onCancel }) => {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center relative overflow-hidden" data-testid="waiting-page">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#7c5cfc] opacity-10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#fc5c7d] opacity-10 blur-[120px] rounded-full animate-pulse"></div>
      </div>
      
      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="absolute top-6 right-6 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        data-testid="cancel-search-button"
      >
        <X size={24} />
      </button>
      
      {/* Waiting content */}
      <div className="relative z-10 text-center">
        {/* Radar animation */}
        <div className="relative inline-block mb-8">
          <div className="absolute inset-0 animate-ping">
            <div className="w-48 h-48 rounded-full bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] opacity-20"></div>
          </div>
          <div className="absolute inset-0 animate-pulse" style={{ animationDelay: '0.5s' }}>
            <div className="w-48 h-48 rounded-full bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] opacity-30"></div>
          </div>
          <div className="relative w-48 h-48 rounded-full bg-gradient-to-br from-[#7c5cfc] to-[#fc5c7d] flex items-center justify-center">
            <svg className="w-24 h-24 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        
        {/* Text */}
        <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Syne, sans-serif' }} data-testid="searching-title">
          Finding someone to chat with...
        </h2>
        <p className="text-gray-400 animate-pulse">Searching for your next connection</p>
        
        {/* Loading dots */}
        <div className="flex justify-center gap-2 mt-6">
          <div className="w-3 h-3 bg-[#7c5cfc] rounded-full animate-bounce"></div>
          <div className="w-3 h-3 bg-[#fc5c7d] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-3 h-3 bg-[#7c5cfc] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  );
};

export default WaitingPage;
