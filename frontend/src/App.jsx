import React, { useState, useEffect } from 'react';
import { ensureLocalKeyPair } from './crypto';
import * as api from './api';
import Auth from './Auth.jsx';
import ChatLayout from './ChatLayout.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [keyPair, setKeyPair] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userJson = localStorage.getItem('user');
    if (token && userJson) {
      setUser(JSON.parse(userJson));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      ensureLocalKeyPair().then(setKeyPair);
    }
  }, [user]);

  function handleAuthed(userData, token) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setKeyPair(null);
  }

  if (loading) return <div className="center-screen">Loading...</div>;

  if (!user) return <Auth onAuthed={handleAuthed} />;

  if (!keyPair) return <div className="center-screen">Setting up encryption keys...</div>;

  return <ChatLayout user={user} keyPair={keyPair} onLogout={handleLogout} />;
}
