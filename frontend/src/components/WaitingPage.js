import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

const WaitingPage = ({ onCancel }) => {
  const [meetProgress, setMeetProgress] = useState(0);
  
  // Animate the meeting progress
  useEffect(() => {
    const interval = setInterval(() => {
      setMeetProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + 2;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, []);
  
  // Calculate positions for walking animation
  const leftPersonX = Math.min(meetProgress * 0.8, 40); // Move from left
  const rightPersonX = Math.min(meetProgress * 0.8, 40); // Move from right
  const isNearMeet = meetProgress > 80;
  
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
        {/* Walking animation container */}
        <div className="relative w-80 h-64 mx-auto mb-8">
          {/* Pulsing background */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="absolute w-48 h-48 rounded-full bg-gradient-to-r from-[#7c5cfc]/20 to-[#fc5c7d]/20 animate-ping" style={{ animationDuration: '2s' }}></div>
          </div>
          
          {/* Ground/path line */}
          <div className="absolute bottom-16 left-8 right-8 h-0.5 bg-gradient-to-r from-[#7c5cfc]/30 via-white/20 to-[#fc5c7d]/30"></div>
          
          {/* Left person (Male) - walking right */}
          <div 
            className="absolute bottom-16 transition-all duration-100"
            style={{ 
              left: `${10 + leftPersonX}%`,
              transform: `translateX(-50%)`
            }}
          >
            {/* Person silhouette with walking animation */}
            <div className={`relative ${isNearMeet ? 'animate-pulse' : ''}`}>
              {/* Glow effect */}
              <div className="absolute inset-0 bg-[#7c5cfc] blur-xl opacity-40 rounded-full scale-150"></div>
              
              {/* Body */}
              <svg width="48" height="80" viewBox="0 0 48 80" className="relative">
                {/* Head */}
                <circle cx="24" cy="12" r="10" fill="#7c5cfc" />
                {/* Body */}
                <path d="M24 22 L24 45" stroke="#7c5cfc" strokeWidth="4" strokeLinecap="round" />
                {/* Arms - animated */}
                <path 
                  d={meetProgress % 20 < 10 ? "M24 28 L12 38 M24 28 L36 38" : "M24 28 L14 34 M24 28 L34 34"} 
                  stroke="#7c5cfc" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                />
                {/* Legs - animated walking */}
                <path 
                  d={meetProgress % 20 < 10 ? "M24 45 L16 70 M24 45 L32 70" : "M24 45 L20 70 M24 45 L28 70"} 
                  stroke="#7c5cfc" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                />
              </svg>
            </div>
          </div>
          
          {/* Right person (Female) - walking left */}
          <div 
            className="absolute bottom-16 transition-all duration-100"
            style={{ 
              right: `${10 + rightPersonX}%`,
              transform: `translateX(50%)`
            }}
          >
            {/* Person silhouette with walking animation */}
            <div className={`relative ${isNearMeet ? 'animate-pulse' : ''}`}>
              {/* Glow effect */}
              <div className="absolute inset-0 bg-[#fc5c7d] blur-xl opacity-40 rounded-full scale-150"></div>
              
              {/* Body */}
              <svg width="48" height="80" viewBox="0 0 48 80" className="relative">
                {/* Head with longer hair */}
                <circle cx="24" cy="12" r="10" fill="#fc5c7d" />
                {/* Hair */}
                <path d="M14 12 Q10 20 12 28" stroke="#fc5c7d" strokeWidth="3" fill="none" />
                <path d="M34 12 Q38 20 36 28" stroke="#fc5c7d" strokeWidth="3" fill="none" />
                {/* Body - dress shape */}
                <path d="M24 22 L24 35 L16 55 L32 55 L24 35" fill="#fc5c7d" />
                {/* Arms - animated */}
                <path 
                  d={meetProgress % 20 < 10 ? "M24 26 L14 36 M24 26 L34 36" : "M24 26 L12 32 M24 26 L36 32"} 
                  stroke="#fc5c7d" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                />
                {/* Legs - animated walking */}
                <path 
                  d={meetProgress % 20 < 10 ? "M20 55 L16 70 M28 55 L32 70" : "M20 55 L20 70 M28 55 L28 70"} 
                  stroke="#fc5c7d" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                />
              </svg>
            </div>
          </div>
          
          {/* Meeting spark effect */}
          {isNearMeet && (
            <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2">
              <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
              <div className="absolute inset-0 w-4 h-4 bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] rounded-full animate-pulse"></div>
            </div>
          )}
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
