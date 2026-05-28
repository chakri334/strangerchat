import { useRef } from 'react';
import { Image as ImageIcon, SkipForward } from 'lucide-react';

const ChatInput = ({
  inputMessage,
  setInputMessage,
  onSubmit,
  onPhotoUpload,
  onDisconnect,
  onSkip,
}) => {
  const fileInputRef = useRef(null);

  return (
    <>
      <div className="flex gap-2 mb-3">
        <button
          onClick={onDisconnect}
          className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors text-red-400"
          data-testid="disconnect-button"
        >
          Disconnect
        </button>
        <button
          onClick={onSkip}
          className="flex-1 py-2 bg-[#7c5cfc]/20 hover:bg-[#7c5cfc]/30 rounded-lg text-sm font-medium transition-colors text-[#7c5cfc] flex items-center justify-center gap-2"
          data-testid="skip-button"
        >
          <SkipForward size={16} />
          Skip
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          data-testid="share-photo-icon"
          title="Share Photo"
        >
          <ImageIcon size={20} className="text-[#7c5cfc]" />
        </button>

        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 min-w-0 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7c5cfc] transition-all"
          data-testid="message-input"
        />

        <button
          type="submit"
          className="flex-shrink-0 p-3 bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] rounded-full hover:shadow-lg hover:shadow-purple-500/20 transition-all"
          data-testid="send-message-button"
          title="Send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onPhotoUpload}
          className="hidden"
          data-testid="photo-input"
        />
      </form>
    </>
  );
};

export default ChatInput;
