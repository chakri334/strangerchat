import { useState, useEffect, useRef } from 'react';
import { X, SkipForward, Image as ImageIcon, MessageCircle, AlertCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import SimplePeer from 'simple-peer';
import PhotoViewer from './PhotoViewer';
import { Analytics } from '../utils/analytics';

const ChatPage = ({ socket, partner, onClose, onSkip }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [audioActive, setAudioActive] = useState(false);
  const [peer, setPeer] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [photoToView, setPhotoToView] = useState(null);
  const [viewingPhotoId, setViewingPhotoId] = useState(null);
  const [partnerDisconnected, setPartnerDisconnected] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportComment, setReportComment] = useState('');
  
  useEffect(() => {
    console.log('ChatPage mounted, setting up Socket.IO listeners');
    
    // Socket listeners
    socket.on('new_message', (data) => {
      console.log('📨 Received message from partner:', data);
      Analytics.messageReceived();
      setMessages((prev) => [...prev, {
        text: data.message,
        from: 'partner',
        timestamp: new Date(data.timestamp)
      }]);
    });
    
    // Received photo from partner
    socket.on('new_photo', (data) => {
      console.log('📷 Received photo from partner');
      Analytics.photoReceived();
      setMessages((prev) => [...prev, {
        type: 'photo',
        photo: data.photo,
        photo_id: data.photo_id,
        from: 'partner',
        timestamp: new Date(),
        deleted: false
      }]);
      toast.success('Partner sent a photo! Tap to view');
    });
    
    // Our photo was sent successfully
    socket.on('photo_sent', (data) => {
      console.log('📷 Photo sent successfully, photo_id:', data.photo_id);
      Analytics.photoSent();
      toast.success('Photo sent!');
      setMessages((prev) => [...prev, {
        type: 'photo',
        photo: data.photo,
        photo_id: data.photo_id,
        from: 'me',
        timestamp: new Date(),
        deleted: false
      }]);
    });
    
    // Photo timer started (when recipient opens it)
    socket.on('photo_timer_started', (data) => {
      console.log('⏱️ Photo timer started:', data.photo_id);
      // We could show a subtle indicator but timer is hidden from UI
    });
    
    // Photo deleted after timer
    socket.on('photo_deleted', (data) => {
      console.log('🗑️ Photo deleted:', data.photo_id);
      setMessages((prev) => prev.map(msg => 
        msg.photo_id === data.photo_id 
          ? { ...msg, deleted: true, photo: null }
          : msg
      ));
      
      // If currently viewing this photo, close the viewer
      setPhotoToView((current) => {
        if (viewingPhotoId === data.photo_id) {
          toast.info('Photo has expired');
          return null;
        }
        return current;
      });
    });
    
    socket.on('random_topic', (data) => {
      toast.info(data.topic, { duration: 5000 });
    });
    
    socket.on('audio_signal', (data) => {
      if (peer) {
        peer.signal(data.signal);
      } else {
        initPeer(false, data.signal);
      }
    });
    
    socket.on('partner_disconnected', () => {
      toast.info('Chat partner disconnected');
      setPartnerDisconnected(true);
    });
    
    socket.on('report_submitted', (data) => {
      toast.success(data.message);
      setShowReportModal(false);
      setReportComment('');
    });
    
    return () => {
      console.log('ChatPage unmounting, removing listeners');
      socket.off('new_message');
      socket.off('new_photo');
      socket.off('photo_sent');
      socket.off('photo_timer_started');
      socket.off('photo_deleted');
      socket.off('random_topic');
      socket.off('audio_signal');
      socket.off('partner_disconnected');
      socket.off('report_submitted');
      
      if (peer) {
        peer.destroy();
      }
    };
  }, [socket, peer, viewingPhotoId]);
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const initPeer = (initiator, signalData = null) => {
    try {
      const newPeer = new SimplePeer({
        initiator,
        trickle: false,
        stream: null // We'll add stream when user enables audio
      });
      
      newPeer.on('signal', (data) => {
        socket.emit('audio_signal', { signal: data });
      });
      
      newPeer.on('stream', (stream) => {
        const audio = new Audio();
        audio.srcObject = stream;
        audio.play();
      });
      
      newPeer.on('error', (err) => {
        console.error('Peer error:', err);
        toast.error('Audio connection failed');
        setAudioActive(false);
      });
      
      if (signalData) {
        newPeer.signal(signalData);
      }
      
      setPeer(newPeer);
    } catch (error) {
      console.error('Error initializing peer:', error);
      toast.error('Could not initialize audio');
    }
  };
  
  const toggleAudio = async () => {
    if (audioActive) {
      // Stop audio
      if (peer) {
        peer.destroy();
        setPeer(null);
      }
      setAudioActive(false);
      toast.info('Audio disconnected');
    } else {
      // Start audio
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        const newPeer = new SimplePeer({
          initiator: true,
          trickle: false,
          stream
        });
        
        newPeer.on('signal', (data) => {
          socket.emit('audio_signal', { signal: data });
        });
        
        newPeer.on('stream', (partnerStream) => {
          const audio = new Audio();
          audio.srcObject = partnerStream;
          audio.play();
        });
        
        newPeer.on('error', (err) => {
          console.error('Peer error:', err);
          toast.error('Audio connection failed');
          setAudioActive(false);
        });
        
        setPeer(newPeer);
        setAudioActive(true);
        toast.success('Audio connected');
      } catch (error) {
        toast.error('Microphone access denied');
      }
    }
  };
  
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim()) return;
    
    console.log('📤 Sending message:', inputMessage);
    
    // Add to local messages
    setMessages((prev) => [...prev, {
      text: inputMessage,
      from: 'me',
      timestamp: new Date()
    }]);
    
    // Send via socket
    socket.emit('send_message', { message: inputMessage });
    Analytics.messageSent();
    console.log('✓ Message emitted to server');
    
    setInputMessage('');
  };
  
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Reset input so same file can be selected again
    e.target.value = '';
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large. Max 5MB.');
      return;
    }
    
    // Check if socket is connected
    if (!socket || !socket.connected) {
      toast.error('Not connected. Please wait...');
      return;
    }
    
    toast.info('Sending photo...');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      console.log('📷 Sending photo, size:', Math.round(base64.length / 1024), 'KB');
      socket.emit('send_photo', { photo: base64 });
    };
    reader.onerror = () => {
      toast.error('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };
  
  const handleOpenPhoto = (photo, photoId) => {
    setPhotoToView(photo);
    setViewingPhotoId(photoId);
    Analytics.photoViewed();
    // Notify server that photo was opened (starts the 15s timer)
    socket.emit('photo_opened', { photo_id: photoId });
  };
  
  const handleClosePhotoViewer = () => {
    setPhotoToView(null);
    setViewingPhotoId(null);
  };
  
  const handleSkip = () => {
    console.log('Skip clicked, onSkip:', onSkip);
    socket.emit('skip_chat', {});
    Analytics.skipChat();
    
    // Use onSkip if available, otherwise use onClose
    if (onSkip && typeof onSkip === 'function') {
      console.log('Calling onSkip()');
      onSkip();
    } else {
      console.log('onSkip not available, calling onClose()');
      toast.info('Finding new chat...');
      onClose();
    }
  };
  
  const handleDisconnect = () => {
    console.log('Disconnect clicked');
    socket.emit('disconnect_chat', { notify: true });
    Analytics.disconnectChat();
    onClose();
  };
  
  const handleRandomTopic = () => {
    socket.emit('get_random_topic', {});
  };
  
  const handleReport = () => {
    setShowReportModal(true);
  };
  
  const submitReport = () => {
    // Gather chat history for the report
    const chatHistory = messages.map(msg => ({
      from: msg.from,
      type: msg.type || 'text',
      text: msg.text || (msg.type === 'photo' ? '[Photo]' : ''),
      timestamp: msg.timestamp?.toISOString()
    }));
    
    socket.emit('report_user', {
      comment: reportComment,
      chat_history: chatHistory
    });
    Analytics.reportUser();
    
    // Close chat after reporting
    setTimeout(() => {
      handleDisconnect();
    }, 1000);
  };
  
  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#0a0a0a] text-white flex flex-col" data-testid="chat-page">
      {/* Header */}
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
          onClick={handleDisconnect}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          data-testid="close-chat-button"
        >
          <X size={24} />
        </button>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="messages-container">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <MessageCircle size={48} className="mx-auto mb-2 opacity-50" />
              <p>Start a conversation!</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}
              data-testid={`message-${msg.from}`}
            >
              {msg.type === 'photo' ? (
                /* Photo Message */
                msg.deleted ? (
                  /* Deleted Photo Placeholder */
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
                    <div className="px-3 py-1 text-xs opacity-60">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ) : (
                  /* Active Photo */
                  <div
                    onClick={() => handleOpenPhoto(msg.photo, msg.photo_id)}
                    className={`max-w-[75%] cursor-pointer hover:opacity-90 transition-opacity ${
                      msg.from === 'me'
                        ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d]'
                        : 'bg-white/10'
                    } rounded-2xl overflow-hidden`}
                  >
                    <div className="relative">
                      <img 
                        src={msg.photo} 
                        alt="Shared" 
                        className="w-48 h-48 object-cover blur-sm"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="text-white text-center">
                          <ImageIcon size={32} className="mx-auto mb-2" />
                          <p className="text-sm font-medium">Tap to view</p>
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-1 text-xs opacity-60">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              ) : (
                /* Text Message */
                <div
                  className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                    msg.from === 'me'
                      ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  <p className="break-words">{msg.text}</p>
                  <p className="text-xs opacity-60 mt-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
      </div>
      
      {/* Action Pills */}
      <div className="px-4 pb-2 flex gap-2">
          <button
            onClick={handleRandomTopic}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full text-xs transition-colors"
            data-testid="random-topic-button"
          >
            Random Topic
          </button>
          <button
            onClick={handleReport}
            className="px-3 py-1.5 bg-white/5 hover:bg-red-500/20 rounded-full text-xs transition-colors flex items-center gap-1"
            data-testid="report-button"
          >
            <AlertCircle size={12} />
            Report
          </button>
      </div>
      
      {/* Input Area */}
      <div className="p-4 border-t border-white/10">
        {partnerDisconnected ? (
          /* Partner Disconnected - Show message, report option, and reconnect option */
          <div className="text-center py-4">
            <p className="text-gray-400 mb-4">Chat ended. Messages are view-only.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleReport}
                className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl font-medium transition-all text-red-400 flex items-center gap-2"
                data-testid="report-after-disconnect-button"
              >
                <AlertCircle size={16} />
                Report User
              </button>
              <button
                onClick={() => {
                  console.log('Find New Chat clicked');
                  if (onSkip && typeof onSkip === 'function') {
                    onSkip();
                  } else if (onClose) {
                    onClose();
                  }
                }}
                className="px-6 py-3 bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                data-testid="find-new-button"
              >
                Find New Chat
              </button>
            </div>
          </div>
        ) : (
          <>
          {/* Main Action Buttons - Smaller and cleaner */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleDisconnect}
              className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors text-red-400"
              data-testid="disconnect-button"
            >
              Disconnect
            </button>
            <button
              onClick={handleSkip}
              className="flex-1 py-2 bg-[#7c5cfc]/20 hover:bg-[#7c5cfc]/30 rounded-lg text-sm font-medium transition-colors text-[#7c5cfc] flex items-center justify-center gap-2"
              data-testid="skip-button"
            >
              <SkipForward size={16} />
              Skip
            </button>
          </div>
          
          {/* Message Input with Icons */}
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            {/* Share Photo Icon */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              data-testid="share-photo-icon"
              title="Share Photo"
            >
              <ImageIcon size={20} className="text-[#7c5cfc]" />
            </button>
            
            {/* Text Input */}
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 min-w-0 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7c5cfc] transition-all"
              data-testid="message-input"
            />
            
            {/* Audio Toggle Icon */}
            <button
              type="button"
              onClick={toggleAudio}
              className={`flex-shrink-0 p-2.5 rounded-full transition-all ${
                audioActive
                  ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
              data-testid="audio-toggle-icon"
              title={audioActive ? 'Audio Active' : 'Start Audio'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="currentColor"/>
                <path d="M19 10V12C19 15.87 15.87 19 12 19C8.13 19 5 15.87 5 12V10H3V12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12V10H19Z" fill="currentColor"/>
                <path d="M11 21H13V23H11V21Z" fill="currentColor"/>
              </svg>
            </button>
            
            {/* Send Button */}
            <button
              type="submit"
              className="flex-shrink-0 p-3 bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] rounded-full hover:shadow-lg hover:shadow-purple-500/20 transition-all"
              data-testid="send-message-button"
              title="Send"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/>
              </svg>
            </button>
          </form>
          </>
        )}
        </div>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
          className="hidden"
          data-testid="photo-input"
        />
      </div>
      
      {/* Photo Viewer */}
      {photoToView && (
        <PhotoViewer
          photo={photoToView}
          onClose={handleClosePhotoViewer}
        />
      )}
      
      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" data-testid="report-modal">
          <div className="bg-[#1a1a1a] rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4" style={{ fontFamily: 'Syne, sans-serif' }}>Report User</h3>
            <p className="text-gray-400 text-sm mb-4">
              The entire chat history will be saved for review. Add any additional comments below (optional).
            </p>
            <textarea
              value={reportComment}
              onChange={(e) => setReportComment(e.target.value)}
              placeholder="Add comments about this report (optional)..."
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none h-24 mb-4"
              data-testid="report-comment-input"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportComment('');
                }}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-colors"
                data-testid="report-cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-medium transition-colors"
                data-testid="report-submit-button"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatPage;
