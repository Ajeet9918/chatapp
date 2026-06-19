import React, { useState, useEffect, useRef } from 'react';
import * as api from './api';
import { deriveSharedKey, encryptMessage, decryptMessage } from './crypto';
import { useCall } from './useCall';
import CallPanel from './CallPanel.jsx';
import { formatLastSeen, formatMessageTime } from './utils';

const TYPING_TIMEOUT = 2000;

export default function ChatWindow({ conversation, user, keyPair, socket, title, presence, otherUser, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sharedKey, setSharedKey] = useState(null);
  const [ready, setReady] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const sentTypingRef = useRef(false);
  const call = useCall(socket, conversation.id, user);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    async function setup() {
      if (conversation.is_group) {
        const other = conversation.members.find(
          (m) => m.id !== user.id && m.public_key
        );
        console.log('GROUP other member:', other);
        if (other) {
          const key = await deriveSharedKey(keyPair.privateKey, other.public_key);
          setSharedKey(key);
        }
      } else {
        const other = conversation.members.find((m) => m.id !== user.id);
        console.log('OTHER USER:', other);
        console.log('OTHER PUBLIC KEY:', other?.public_key);
        console.log('MY KEYPAIR:', keyPair);
        if (other && other.public_key) {
          const key = await deriveSharedKey(keyPair.privateKey, other.public_key);
          console.log('SHARED KEY DERIVED:', key);
          setSharedKey(key);
        } else {
          console.log('NO PUBLIC KEY FOUND - this is why decrypt fails');
        }
      }
      setReady(true);
    }
  }, [conversation, keyPair]);

  // Step 2: Load & decrypt message history
  useEffect(() => {
    if (!ready) return;
    async function load() {
      const history = await api.getMessages(conversation.id);
      const normalized = history.map((m) => ({
        ...m,
        time: m.created_at * 1000,
        delivered: !!m.delivered,
        read_at: m.read_at ? m.read_at * 1000 : null
      }));
      if (!sharedKey) {
        setMessages(normalized.map((m) => ({ ...m, plaintext: '[No shared key]' })));
        return;
      }
      const decrypted = await Promise.all(
        normalized.map(async (m) => ({
          ...m,
          plaintext: await decryptMessage(sharedKey, m.ciphertext, m.iv)
        }))
      );
      setMessages(decrypted);
    }
    load();
  }, [ready, sharedKey, conversation.id]);

  // Step 3: Listen for real-time incoming messages, status updates, and typing
  useEffect(() => {
    if (!socket || !sharedKey) return;

    async function onNewMessage(payload) {
      if (payload.conversationId !== conversation.id) return;
      const plaintext = await decryptMessage(sharedKey, payload.ciphertext, payload.iv);
      const msg = {
        ...payload,
        time: payload.createdAt,
        delivered: !!payload.delivered,
        read_at: payload.read_at,
        plaintext
      };
      setMessages((prev) => [...prev, msg]);

      // If this message is from the other person, mark it delivered + read
      // immediately since the conversation window is open right now.
      if (payload.senderId !== user.id) {
        socket.emit('message:delivered', { conversationId: conversation.id, messageId: payload.id });
        socket.emit('message:read', { conversationId: conversation.id, messageIds: [payload.id] });
      }
    }

    function onStatus({ messageId, messageIds, status, readAt }) {
      const ids = messageIds || [messageId];
      setMessages((prev) =>
        prev.map((m) =>
          ids.includes(m.id)
            ? {
              ...m,
              delivered: status === 'delivered' || status === 'read' ? true : m.delivered,
              read_at: status === 'read' ? readAt : m.read_at
            }
            : m
        )
      );
    }

    function onTyping({ conversationId, userId, isTyping }) {
      if (conversationId !== conversation.id) return;
      if (otherUser && userId === otherUser.id) {
        setIsOtherTyping(isTyping);
      }
    }

    socket.on('message:new', onNewMessage);
    socket.on('message:status', onStatus);
    socket.on('typing', onTyping);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:status', onStatus);
      socket.off('typing', onTyping);
    };
  }, [socket, sharedKey, conversation.id, otherUser, user.id]);
  useEffect(() => {
    if (!socket || messages.length === 0) return;
    const unread = messages.filter((m) => m.sender_id && m.sender_id !== user.id && !m.read_at);
    if (unread.length > 0) {
      socket.emit('message:read', {
        conversationId: conversation.id,
        messageIds: unread.map((m) => m.id)
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOtherTyping]);

  function handleTextChange(e) {
    setText(e.target.value);
    if (!socket) return;

    if (!sentTypingRef.current) {
      socket.emit('typing', { conversationId: conversation.id, isTyping: true });
      sentTypingRef.current = true;
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { conversationId: conversation.id, isTyping: false });
      sentTypingRef.current = false;
    }, TYPING_TIMEOUT);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || !sharedKey || !socket) return;

    // Encrypt on the client. The server only ever sees this ciphertext.
    const { ciphertext, iv } = await encryptMessage(sharedKey, text);

    socket.emit('message:send', {
      conversationId: conversation.id,
      ciphertext,
      iv
    });

    // Stop "typing..." indicator immediately on send
    clearTimeout(typingTimeoutRef.current);
    if (sentTypingRef.current) {
      socket.emit('typing', { conversationId: conversation.id, isTyping: false });
      sentTypingRef.current = false;
    }

    setText('');
  }

  // ---------- Presence subtitle (online / last seen / typing) ----------
  let subtitle = null;
  if (!conversation.is_group && otherUser) {
    const status = presence?.[otherUser.id];
    if (isOtherTyping) {
      subtitle = <span className="typing-text">typing...</span>;
    } else if (status?.online) {
      subtitle = <span className="online-text">online</span>;
    } else if (status?.lastSeen) {
      subtitle = <span className="lastseen-text">{formatLastSeen(status.lastSeen)}</span>;
    }
  }

  function renderTicks(m) {
    const isOwn = m.senderId === user.id || m.sender_id === user.id;
    if (!isOwn) return null;
    if (m.read_at) return <span className="ticks read">✓✓</span>;
    if (m.delivered) return <span className="ticks">✓✓</span>;
    return <span className="ticks">✓</span>;
  }

  return (
    <div className={`chat-window ${darkMode ? "dark-theme" : "light-theme"}`}>
      <div className="chat-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <div className="chat-header-title">
          <h2>{title}</h2>
          {subtitle && <div className="chat-subtitle">{subtitle}</div>}
        </div>
        <div className="header-right">
          <span className="encryption-badge">
            {sharedKey ? '🔒 End-to-end encrypted' : '⚠️ No encryption key available'}
          </span>
          <button
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          <CallPanel call={call} />
        </div>
      </div>

      <div className="messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message ${m.senderId === user.id || m.sender_id === user.id ? 'own' : 'other'}`}
          >
            <div className="bubble">
              <div className="bubble-text">{m.plaintext}</div>
              <div className="bubble-meta">
                <span className="bubble-time">{formatMessageTime(m.time)}</span>
                {renderTicks(m)}
              </div>
            </div>
          </div>
        ))}
        {isOtherTyping && (
          <div className="message other">
            <div className="bubble typing-bubble">
              <span className="typing-dots"><span></span><span></span><span></span></span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="message-input" onSubmit={handleSend}>
        <input
          placeholder={sharedKey ? 'Type a message...' : 'Encryption key unavailable'}
          value={text}
          onChange={handleTextChange}
          disabled={!sharedKey}
        />
        <button type="submit" disabled={!sharedKey}>Send</button>
      </form>
    </div>
  );
}
