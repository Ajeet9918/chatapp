import React, { useState } from 'react';
import * as api from './api';
import { ensureLocalKeyPair, exportPublicKey } from './crypto';

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login'); 
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const kp = await ensureLocalKeyPair();
        const publicKeyB64 = kp.publicKeyB64;
        const data = await api.register(username, password, publicKeyB64);
        onAuthed(data.user, data.token);
      } else {
        const data = await api.login(username, password);
        await ensureLocalKeyPair();
        onAuthed(data.user, data.token);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="auth-card">
        <h1>🔒 E2EE Chat</h1>
        <p className="subtitle">
          {mode === 'login' ? 'Welcome back' : 'Create an account'}
        </p>
        <form onSubmit={handleSubmit}>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Register'}
          </button>
        </form>
        <p className="switch-mode">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <a onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Log In'}
          </a>
        </p>
        <p className="note">
          Your encryption keys are generated and stored only on this device.
        </p>
      </div>
    </div>
  );
}
