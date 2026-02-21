import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const PhotoViewer = ({ photo, onClose }) => {
  const [timeLeft, setTimeLeft] = useState(15);
  const [isBlurred, setIsBlurred] = useState(false);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Screenshot prevention
    const handleKeyDown = (e) => {
      // Print Screen, Cmd+Shift+3/4/5 (Mac), Windows+Print Screen
      if (
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) ||
        (e.key === 'Meta' && e.shiftKey)
      ) {
        setIsBlurred(true);
        setTimeout(() => setIsBlurred(false), 2000);
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBlurred(true);
      } else {
        setTimeout(() => setIsBlurred(false), 1000);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onClose]);
  
  const progress = (timeLeft / 15) * 100;
  
  return (
    <div 
      className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
      onContextMenu={(e) => e.preventDefault()}
      data-testid="photo-viewer"
    >
      {/* Timer Ring - Hidden but functional */}
      
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-8 left-8 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        data-testid="close-photo-button"
      >
        <X size={24} className="text-white" />
      </button>
      
      {/* Photo */}
      <div className="max-w-4xl max-h-[80vh] relative">
        <img
          src={photo}
          alt="Shared"
          className={`max-w-full max-h-[80vh] object-contain transition-all duration-300 select-none ${
            isBlurred ? 'blur-3xl' : ''
          }`}
          draggable="false"
          onContextMenu={(e) => e.preventDefault()}
          data-testid="shared-photo"
        />
        {isBlurred && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-2xl font-bold">
            🚫 Screenshot Detected
          </div>
        )}
      </div>
      
      <div className="absolute bottom-8 text-center text-white/60 text-sm">
        Photo will disappear in {timeLeft} seconds
      </div>
    </div>
  );
};

export default PhotoViewer;
