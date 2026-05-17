import { X } from 'lucide-react';

const ChatHeader = ({ partner, partnerDisconnected, onClose }) => (
  <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-[#7c5cfc]/10 to-[#fc5c7d]/10">
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#7c5cfc] to-[#fc5c7d] flex items-center justify-center text-2xl">
        {partner.emoji}
      </div>
      <div>
        <div className="font-bold" data-testid="partner-name">{partner.name}</div>
        <div className={`text-xs flex items-center gap-1 ${partnerDisconnected ? 'text-red-400' : 'text-green-400'}`}>
          <span className={`w-2 h-2 rounded-full ${partnerDisconnected ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`}></span>
          {partnerDisconnected ? 'Disconnected' : 'Online'}
        </div>
      </div>
    </div>
    <button
      onClick={onClose}
      className="p-2 rounded-full hover:bg-white/10 transition-colors"
      data-testid="close-chat-button"
    >
      <X size={24} />
    </button>
  </div>
);

export default ChatHeader;
