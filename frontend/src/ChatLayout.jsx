import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import * as api from './api';
import { SOCKET_URL } from './api';
import ChatWindow from './ChatWindow.jsx';

export default function ChatLayout({ user, keyPair, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [newChatUsername, setNewChatUsername] = useState('');
  const [error, setError] = useState('');
  const [presence, setPresence] = useState({}); // userId -> { online, lastSeen }
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect_error', (err) => setError('Connection error: ' + err.message));

    socket.on('presence', ({ userId, online, lastSeen }) => {
      setPresence((prev) => ({
        ...prev,
        [userId]: { online, lastSeen: lastSeen ?? prev[userId]?.lastSeen }
      }));
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    try {
      const convs = await api.getConversations();
      setConversations(convs);

      // Fetch initial online/last-seen status for all "other" members
      const otherIds = new Set();
      convs.forEach((c) => {
        c.members.forEach((m) => {
          if (m.id !== user.id) otherIds.add(m.id);
        });
      });
      const statuses = await Promise.all(
        [...otherIds].map((id) => api.getUserStatus(id).catch(() => null))
      );
      setPresence((prev) => {
        const next = { ...prev };
        statuses.forEach((s) => {
          if (s) next[s.id] = { online: s.online, lastSeen: s.lastSeen };
        });
        return next;
      });
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleStartChat(e) {
    e.preventDefault();
    setError('');
    try {
      const { conversationId, peer } = await api.startDirectConversation(newChatUsername);
      await loadConversations();
      setActiveConv({
        id: conversationId,
        is_group: 0,
        name: peer.username,
        members: [
          { id: user.id, username: user.username },
          { id: peer.id, username: peer.username, public_key: peer.publicKey }
        ]
      });
      setNewChatUsername('');
    } catch (e) {
      setError(e.message);
    }
  }

  function getConvTitle(conv) {
    if (conv.is_group) return conv.name || 'Group chat';
    const other = conv.members.find((m) => m.id !== user.id);
    return other ? other.username : 'Unknown';
  }

  function getOtherMember(conv) {
    return conv.members.find((m) => m.id !== user.id);
  }

  return (
    <div className="chat-layout">
      <div className={`sidebar ${activeConv ? 'sidebar-hidden-mobile' : ''}`}>
        <div className="sidebar-header">
          <span>👤 {user.username}</span>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>

        <form className="new-chat-form" onSubmit={handleStartChat}>
          <input
            placeholder="Start chat with username..."
            value={newChatUsername}
            onChange={(e) => setNewChatUsername(e.target.value)}
          />
          <button type="submit">+</button>
        </form>

        {error && <div className="error">{error}</div>}

        <div className="conversation-list">
          {conversations.map((conv) => {
            const other = !conv.is_group ? getOtherMember(conv) : null;
            const isOnline = other && presence[other.id]?.online;
            const initials = getConvTitle(conv).charAt(0).toUpperCase();
            return (
              <div
                key={conv.id}
                className={`conversation-item ${activeConv?.id === conv.id ? 'active' : ''}`}
                onClick={() => setActiveConv(conv)}
              >
                <div className="conv-avatar">
                  {conv.is_group ? '👥' : initials}
                  {!conv.is_group && (
                    <span className={`presence-dot ${isOnline ? 'online' : 'offline'}`} />
                  )}
                </div>
                <div className="conv-info">
                  <span className="conv-name">{getConvTitle(conv)}</span>
                  <span className="conv-type">{conv.is_group ? 'Group chat' : '🔒 Encrypted'}</span>
                </div>
              </div>
            );
          })}
          {conversations.length === 0 && (
            <div className="empty-hint">No chats yet. Start one above!</div>
          )}
        </div>
      </div>

      <div className={`main-panel ${activeConv ? 'main-panel-active-mobile' : ''}`}>
        {activeConv ? (
            <ChatWindow
              key={activeConv.id}
              conversation={activeConv}
              user={user}
              keyPair={keyPair}
              socket={socketRef.current}
              title={getConvTitle(activeConv)}
              presence={presence}
              otherUser={getOtherMember(activeConv)}
              onBack={() => setActiveConv(null)}
            />
        ) : (
          <div className="center-screen">
            <p>Select a conversation or start a new one 🔒</p>
          </div>
        )}
      </div>
    </div>
  );
}
