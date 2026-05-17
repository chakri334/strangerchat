import { useEffect, useRef } from 'react';
import { Image as ImageIcon, MessageCircle } from 'lucide-react';

const formatTime = (date) => date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const DeletedPhotoBubble = ({ msg }) => (
  <div
    className={`max-w-[75%] ${
      msg.from === 'me'
        ? 'bg-gradient-to-r from-[#7c5cfc]/30 to-[#fc5c7d]/30'
        : 'bg-white/5'
    } rounded-2xl overflow-hidden`}
  >
    <div className="w-48 h-32 flex items-center justify-center text-gray-400">
      <div className="text-center">
        <ImageIcon size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-xs">Photo deleted</p>
      </div>
    </div>
    <div className="px-3 py-1 text-xs opacity-60">{formatTime(msg.timestamp)}</div>
  </div>
);

const PhotoBubble = ({ msg, onOpen }) => (
  <div
    onClick={() => onOpen(msg.photo, msg.photo_id)}
    className={`max-w-[75%] cursor-pointer hover:opacity-90 transition-opacity ${
      msg.from === 'me'
        ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d]'
        : 'bg-white/10'
    } rounded-2xl overflow-hidden`}
  >
    <div className="relative">
      <img src={msg.photo} alt="Shared" className="w-48 h-48 object-cover blur-sm" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
        <div className="text-white text-center">
          <ImageIcon size={32} className="mx-auto mb-2" />
          <p className="text-sm font-medium">Tap to view</p>
        </div>
      </div>
    </div>
    <div className="px-3 py-1 text-xs opacity-60">{formatTime(msg.timestamp)}</div>
  </div>
);

const TextBubble = ({ msg }) => (
  <div
    className={`max-w-[75%] px-4 py-2 rounded-2xl ${
      msg.from === 'me'
        ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white'
        : 'bg-white/10 text-white'
    }`}
  >
    <p className="break-words">{msg.text}</p>
    <p className="text-xs opacity-60 mt-1">{formatTime(msg.timestamp)}</p>
  </div>
);

const renderBubble = (msg, onOpenPhoto) => {
  if (msg.type !== 'photo') return <TextBubble msg={msg} />;
  if (msg.deleted) return <DeletedPhotoBubble msg={msg} />;
  return <PhotoBubble msg={msg} onOpen={onOpenPhoto} />;
};

const MessageList = ({ messages, onOpenPhoto }) => {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="messages-container">
      {messages.length === 0 && (
        <div className="text-center text-gray-500 mt-8">
          <MessageCircle size={48} className="mx-auto mb-2 opacity-50" />
          <p>Start a conversation!</p>
        </div>
      )}

      {messages.map((msg, idx) => (
        <div
          key={msg.photo_id || msg.timestamp?.getTime() || idx}
          className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}
          data-testid={`message-${msg.from}`}
        >
          {renderBubble(msg, onOpenPhoto)}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};

export default MessageList;
