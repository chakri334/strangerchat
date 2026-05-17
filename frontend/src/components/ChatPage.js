import { useState, useEffect, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import PhotoViewer from './PhotoViewer';
import ChatHeader from './chat/ChatHeader';
import MessageList from './chat/MessageList';
import ChatInput from './chat/ChatInput';
import ReportModal from './chat/ReportModal';
import DisconnectedFooter from './chat/DisconnectedFooter';
import { Analytics } from '../utils/analytics';

const getGuestAuth = () => {
  try {
    return JSON.parse(localStorage.getItem('authSession') || '{}');
  } catch {
    return {};
  }
};

const ChatPage = ({ socket, partner, onClose, onSkip }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [photoToView, setPhotoToView] = useState(null);
  const [viewingPhotoId, setViewingPhotoId] = useState(null);
  const [partnerDisconnected, setPartnerDisconnected] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportComment, setReportComment] = useState('');

  useEffect(() => {
    const handleNewMessage = (data) => {
      Analytics.messageReceived();
      setMessages((prev) => [...prev, {
        text: data.message,
        from: 'partner',
        timestamp: new Date(data.timestamp),
      }]);
    };

    const handleNewPhoto = (data) => {
      Analytics.photoReceived();
      setMessages((prev) => [...prev, {
        type: 'photo',
        photo: data.photo,
        photo_id: data.photo_id,
        from: 'partner',
        timestamp: new Date(),
        deleted: false,
      }]);
      toast.success('Partner sent a photo! Tap to view');
    };

    const handlePhotoSent = (data) => {
      Analytics.photoSent();
      toast.success('Photo sent!');
      setMessages((prev) => [...prev, {
        type: 'photo',
        photo: data.photo,
        photo_id: data.photo_id,
        from: 'me',
        timestamp: new Date(),
        deleted: false,
      }]);
    };

    const handlePhotoDeleted = (data) => {
      setMessages((prev) => prev.map((msg) =>
        msg.photo_id === data.photo_id
          ? { ...msg, deleted: true, photo: null }
          : msg
      ));
      setPhotoToView((current) => {
        if (viewingPhotoId === data.photo_id) {
          toast.info('Photo has expired');
          return null;
        }
        return current;
      });
    };

    const handleRandomTopic = (data) => toast.info(data.topic, { duration: 5000 });
    const handlePartnerDisconnected = () => {
      toast.info('Chat partner disconnected');
      setPartnerDisconnected(true);
    };
    const handleReportSubmitted = (data) => {
      toast.success(data.message);
      setShowReportModal(false);
      setReportComment('');
    };

    socket.on('new_message', handleNewMessage);
    socket.on('new_photo', handleNewPhoto);
    socket.on('photo_sent', handlePhotoSent);
    socket.on('photo_deleted', handlePhotoDeleted);
    socket.on('random_topic', handleRandomTopic);
    socket.on('partner_disconnected', handlePartnerDisconnected);
    socket.on('report_submitted', handleReportSubmitted);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('new_photo', handleNewPhoto);
      socket.off('photo_sent', handlePhotoSent);
      socket.off('photo_deleted', handlePhotoDeleted);
      socket.off('random_topic', handleRandomTopic);
      socket.off('partner_disconnected', handlePartnerDisconnected);
      socket.off('report_submitted', handleReportSubmitted);
    };
  }, [socket, viewingPhotoId]);

  const handleSendMessage = useCallback((e) => {
    e.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed) return;

    const authSession = getGuestAuth();
    if (authSession.mode === 'guest') {
      const count = Number(localStorage.getItem('guestMessageCount') || '0');
      if (count >= 20) {
        toast.error('Guest message limit reached. Upgrade account in Settings.');
        return;
      }
      localStorage.setItem('guestMessageCount', String(count + 1));
    }

    setMessages((prev) => [...prev, { text: trimmed, from: 'me', timestamp: new Date() }]);
    socket.emit('send_message', { message: trimmed });
    Analytics.messageSent();
    setInputMessage('');
  }, [inputMessage, socket]);

  const handlePhotoUpload = useCallback((e) => {
    const authSession = getGuestAuth();
    if (authSession.mode === 'guest') {
      toast.error('Guest mode cannot upload media. Upgrade account in Settings.');
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large. Max 5MB.');
      return;
    }
    if (!socket || !socket.connected) {
      toast.error('Not connected. Please wait...');
      return;
    }

    toast.info('Sending photo...');
    const reader = new FileReader();
    reader.onload = (event) => socket.emit('send_photo', { photo: event.target.result });
    reader.onerror = () => toast.error('Failed to read image file');
    reader.readAsDataURL(file);
  }, [socket]);

  const handleOpenPhoto = useCallback((photo, photoId) => {
    setPhotoToView(photo);
    setViewingPhotoId(photoId);
    Analytics.photoViewed();
    socket.emit('photo_opened', { photo_id: photoId });
  }, [socket]);

  const handleClosePhotoViewer = useCallback(() => {
    setPhotoToView(null);
    setViewingPhotoId(null);
  }, []);

  const handleSkip = useCallback(() => {
    socket.emit('skip_chat', {});
    Analytics.skipChat();
    if (typeof onSkip === 'function') onSkip();
    else { toast.info('Finding new chat...'); onClose(); }
  }, [socket, onSkip, onClose]);

  const handleDisconnect = useCallback(() => {
    socket.emit('disconnect_chat', { notify: true });
    Analytics.disconnectChat();
    onClose();
  }, [socket, onClose]);

  const handleRandomTopic = useCallback(() => socket.emit('get_random_topic', {}), [socket]);

  const submitReport = useCallback(() => {
    const chatHistory = messages.map((msg) => ({
      from: msg.from,
      type: msg.type || 'text',
      text: msg.text || (msg.type === 'photo' ? '[Photo]' : ''),
      timestamp: msg.timestamp?.toISOString(),
    }));
    socket.emit('report_user', { comment: reportComment, chat_history: chatHistory });
    Analytics.reportUser();
    setTimeout(handleDisconnect, 1000);
  }, [messages, reportComment, socket, handleDisconnect]);

  const handleFindNew = useCallback(() => {
    if (typeof onSkip === 'function') onSkip();
    else if (onClose) onClose();
  }, [onSkip, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#0a0a0a] text-white flex flex-col" data-testid="chat-page">
        <ChatHeader partner={partner} partnerDisconnected={partnerDisconnected} onClose={handleDisconnect} />

        <MessageList messages={messages} onOpenPhoto={handleOpenPhoto} />

        <div className="px-4 pb-2 flex gap-2">
          <button
            onClick={handleRandomTopic}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full text-xs transition-colors"
            data-testid="random-topic-button"
          >
            Random Topic
          </button>
          <button
            onClick={() => setShowReportModal(true)}
            className="px-3 py-1.5 bg-white/5 hover:bg-red-500/20 rounded-full text-xs transition-colors flex items-center gap-1"
            data-testid="report-button"
          >
            <AlertCircle size={12} />
            Report
          </button>
        </div>

        <div className="p-4 border-t border-white/10">
          {partnerDisconnected ? (
            <DisconnectedFooter onReport={() => setShowReportModal(true)} onFindNew={handleFindNew} />
          ) : (
            <ChatInput
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              onSubmit={handleSendMessage}
              onPhotoUpload={handlePhotoUpload}
              onDisconnect={handleDisconnect}
              onSkip={handleSkip}
            />
          )}
        </div>
      </div>

      {photoToView && <PhotoViewer photo={photoToView} onClose={handleClosePhotoViewer} />}

      {showReportModal && (
        <ReportModal
          comment={reportComment}
          setComment={setReportComment}
          onCancel={() => { setShowReportModal(false); setReportComment(''); }}
          onSubmit={submitReport}
        />
      )}
    </>
  );
};

export default ChatPage;
