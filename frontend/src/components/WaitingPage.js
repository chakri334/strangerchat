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
        className="absolute top-6 right-6 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors z-20"
        data-testid="cancel-search-button"
      >
        <X size={24} />
      </button>
      
      {/* Waiting content */}
      <div className="relative z-10 text-center px-6">
        {/* Stumble animation container */}
        <div className="relative w-72 h-72 mx-auto mb-8">
          {/* Pulsing background rings */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="absolute w-64 h-64 rounded-full bg-gradient-to-r from-[#7c5cfc]/20 to-[#fc5c7d]/20 animate-ping" style={{ animationDuration: '2s' }}></div>
            <div className="absolute w-56 h-56 rounded-full bg-gradient-to-r from-[#7c5cfc]/30 to-[#fc5c7d]/30 animate-pulse" style={{ animationDuration: '1.5s' }}></div>
          </div>
          
          {/* Stumble image with gentle animation */}
          <div className="relative w-full h-full flex items-center justify-center">
            <img 
              src="https://static.prod-images.emergentagent.com/jobs/e48528ee-14fe-403e-b7d4-a45cb9cb19ec/images/516e06a21fdd3acd7c2b7701db311fd23bf5432eaeccebb55a785c1df48b754a.png"
              alt="Finding someone"
              className="w-56 h-56 object-contain animate-bounce"
              style={{ animationDuration: '2s' }}
              data-testid="stumble-animation"
            />
          </div>
        </div>
        
        {/* Text */}
        <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ fontFamily: 'Syne, sans-serif' }} data-testid="searching-title">
          Finding someone to chat with...
        </h2>
        <p className="text-gray-400 animate-pulse text-sm sm:text-base">Searching for your next connection</p>
        
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
