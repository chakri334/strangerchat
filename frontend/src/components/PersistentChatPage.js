import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, MoreVertical, Ban, Trash2, Pin } from 'lucide-react';
import { toast } from 'sonner';
import { apiJSON } from '../utils/api';

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const Bubble = ({ msg, isMine, onDelete }) => {
  const [menu, setMenu] = useState(false);
  const deleted = msg.deleted_for_everyone;

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1.5 group`}>
      <div className="relative max-w-[78%]">
        <div
          className={`rounded-2xl px-3 py-2 text-sm break-words ${
            isMine
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-slate-950 rounded-br-sm'
              : 'bg-slate-800 text-white rounded-bl-sm'
          } ${deleted ? 'italic opacity-60' : ''}`}
        >
          {msg.photo_data && !deleted && (
            <img src={msg.photo_data} alt="" className="max-w-[200px] rounded-lg mb-1.5" />
          )}
          {deleted ? 'This message was deleted' : msg.text}
          <div className={`text-[9px] mt-0.5 ${isMine ? 'text-emerald-900/70' : 'text-slate-500'}`}>
            {formatTime(msg.created_at)}
          </div>
        </div>
        {!deleted && (
          <button
            onClick={() => setMenu((v) => !v)}
            className={`absolute -top-1.5 ${isMine ? '-left-6' : '-right-6'} opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-slate-700/70 text-slate-200`}
            data-testid={`bubble-menu-${msg.message_id}`}
          >
            <MoreVertical size={10} />
          </button>
        )}
        {menu && (
          <div className={`absolute z-10 top-4 ${isMine ? 'right-0' : 'left-0'} rounded-xl border border-slate-700 bg-slate-900 shadow-xl py-1 text-xs min-w-[140px]`}>
            <button
              onClick={() => { onDelete(msg.message_id, false); setMenu(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200"
              data-testid={`delete-for-me-${msg.message_id}`}
            >
              Delete for me
            </button>
            {isMine && (
              <button
                onClick={() => { onDelete(msg.message_id, true); setMenu(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-red-400"
                data-testid={`delete-for-everyone-${msg.message_id}`}
              >
                Delete for everyone
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const PersistentChatPage = ({ peer, socket, myUserId, onBack, onBlocked }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [pinned, setPinned] = useState(false);
  const endRef = useRef(null);

  const peerId = peer.user_id;

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const { data } = await apiJSON(`/api/conversations/${peerId}/messages?limit=100`);
    setMessages(data?.messages || []);
    setLoading(false);
  }, [peerId]);

  const loadPinnedStatus = useCallback(async () => {
    const { data } = await apiJSON('/api/profile/me');
    setPinned((data?.profile?.hotlist || []).includes(peerId));
  }, [peerId]);

  useEffect(() => {
    loadMessages();
    loadPinnedStatus();
  }, [loadMessages, loadPinnedStatus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time updates via socket
  useEffect(() => {
    if (!socket) return;
    const onDirect = (m) => {
      if (m.sender_id !== peerId) return;
      setMessages((prev) => prev.find((x) => x.message_id === m.message_id) ? prev : [...prev, m]);
    };
    const onDeleted = (d) => {
      setMessages((prev) => prev.map((m) =>
        m.message_id === d.message_id ? { ...m, deleted_for_everyone: true, text: '', photo_data: null } : m
      ));
    };
    const onCleared = () => setMessages([]);
    socket.on('direct_message', onDirect);
    socket.on('message_deleted', onDeleted);
    socket.on('conversation_cleared', onCleared);
    return () => {
      socket.off('direct_message', onDirect);
      socket.off('message_deleted', onDeleted);
      socket.off('conversation_cleared', onCleared);
    };
  }, [socket, peerId]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const { ok, data } = await apiJSON(`/api/conversations/${peerId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    setSending(false);
    if (!ok || !data?.ok) {
      toast.error(data?.message || 'Could not send');
      return;
    }
    setMessages((prev) => [...prev, { ...data.message, sender_id: myUserId, recipient_id: peerId }]);
    setInput('');
  };

  const handleDeleteMsg = async (messageId, forEveryone) => {
    await apiJSON(`/api/conversations/${peerId}/messages/${messageId}?for_everyone=${forEveryone}`, { method: 'DELETE' });
    if (forEveryone) {
      setMessages((prev) => prev.map((m) =>
        m.message_id === messageId ? { ...m, deleted_for_everyone: true, text: '', photo_data: null } : m
      ));
    } else {
      setMessages((prev) => prev.filter((m) => m.message_id !== messageId));
    }
  };

  const handleClearChat = async (forEveryone) => {
    if (!window.confirm(forEveryone ? 'Delete all messages for both of you?' : 'Delete all messages on your side?')) return;
    await apiJSON(`/api/conversations/${peerId}?for_everyone=${forEveryone}`, { method: 'DELETE' });
    setMessages([]);
    setShowMenu(false);
    toast.success('Chat cleared');
  };

  const handleBlock = async () => {
    if (!window.confirm(`Block ${peer.name}? They won't be able to message you.`)) return;
    await apiJSON(`/api/block/${peerId}`, { method: 'POST' });
    toast.success(`${peer.name} blocked`);
    setShowMenu(false);
    onBlocked?.(peerId);
    onBack();
  };

  const togglePin = async () => {
    if (pinned) {
      await apiJSON(`/api/hotlist/${peerId}`, { method: 'DELETE' });
      setPinned(false);
      toast.success('Removed from hotlist');
    } else {
      await apiJSON(`/api/hotlist/${peerId}`, { method: 'POST' });
      setPinned(true);
      toast.success('Pinned to hotlist (never auto-deleted)');
    }
    setShowMenu(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col" data-testid="persistent-chat-page">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-800" data-testid="chat-back-btn">
          <ArrowLeft size={20} />
        </button>
        {peer.picture ? (
          <img src={peer.picture} alt={peer.name} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 flex items-center justify-center text-lg">😊</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate text-sm">{peer.name}</div>
          <div className="text-[10px] text-slate-400 font-mono truncate">{peer.stumble_id}</div>
        </div>
        <button onClick={togglePin} className={`p-2 rounded-full hover:bg-slate-800 ${pinned ? 'text-emerald-400' : 'text-slate-400'}`} title={pinned ? 'Unpin' : 'Pin to hotlist'} data-testid="pin-btn">
          <Pin size={16} />
        </button>
        <div className="relative">
          <button onClick={() => setShowMenu((v) => !v)} className="p-2 rounded-full hover:bg-slate-800" data-testid="chat-menu-btn">
            <MoreVertical size={18} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-10 z-10 w-52 rounded-xl border border-slate-700 bg-slate-900 shadow-xl py-1 text-xs">
              <button onClick={() => handleClearChat(false)} className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2" data-testid="clear-for-me">
                <Trash2 size={12} /> Clear chat (just me)
              </button>
              <button onClick={() => handleClearChat(true)} className="w-full text-left px-3 py-2 hover:bg-slate-800 text-red-400 flex items-center gap-2" data-testid="clear-for-everyone">
                <Trash2 size={12} /> Clear chat for everyone
              </button>
              <div className="h-px bg-slate-800 my-1" />
              <button onClick={handleBlock} className="w-full text-left px-3 py-2 hover:bg-slate-800 text-red-400 flex items-center gap-2" data-testid="block-user-btn">
                <Ban size={12} /> Block {peer.name}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 bg-slate-950" data-testid="chat-messages-list">
        {loading && <div className="text-center text-slate-500 text-xs py-4">Loading…</div>}
        {!loading && messages.length === 0 && (
          <div className="text-center text-slate-500 text-xs py-8">
            <p>No messages yet — say hi to {peer.name}!</p>
            <p className="text-[10px] mt-1">Chats auto-delete after 7 days unless you pin this user.</p>
          </div>
        )}
        {messages.map((m) => (
          <Bubble
            key={m.message_id}
            msg={m}
            isMine={m.sender_id === myUserId}
            onDelete={handleDeleteMsg}
          />
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-900/50 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
          data-testid="persistent-message-input"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          data-testid="persistent-send-btn"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};

export default PersistentChatPage;
