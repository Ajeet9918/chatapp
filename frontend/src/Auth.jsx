import React, { useState } from 'react';
import * as api from './api';
import { ensureLocalKeyPair } from './crypto';
import { ensureLocalKeyPair, generateFreshKeyPair } from './crypto';

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    mobile: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function handle(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors((prev) => ({ ...prev, [e.target.name]: '' }));
    setServerError('');
  }

  function validate() {
    const e = {};
    if (mode === 'register') {
      if (!form.fullName.trim()) e.fullName = 'Full name is required';
      if (!form.mobile.match(/^\+?[0-9]{7,15}$/)) e.mobile = 'Enter a valid mobile number';
      if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
      if (!/[A-Z]/.test(form.password)) e.password = 'Must contain at least one uppercase letter';
      if (!/[0-9]/.test(form.password)) e.password = 'Must contain at least one number';
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    if (!form.username.trim()) e.username = 'Username is required';
    if (mode === 'login' && !form.password) e.password = 'Password is required';
    return e;
  }

  function passwordStrength(pwd) {
    if (!pwd) return null;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { label: 'Weak', color: '#ff4d4d', width: '25%' };
    if (score === 2) return { label: 'Fair', color: '#ffa94d', width: '50%' };
    if (score === 3) return { label: 'Good', color: '#74c69d', width: '75%' };
    return { label: 'Strong', color: '#2a9d4a', width: '100%' };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setServerError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const kp = await generateFreshKeyPair();
        const data = await api.register(
          form.username, form.password, kp.publicKeyB64,
          { fullName: form.fullName, mobile: form.mobile }
        );
        onAuthed(data.user, data.token);
      } else {
        const data = await api.login(form.username, form.password);
        await ensureLocalKeyPair();
        onAuthed(data.user, data.token);
      }
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const strength = mode === 'register' ? passwordStrength(form.password) : null;

  return (
    <div className="center-screen">
      <div className="auth-card">
        <h1>🔒 E2EE Chat</h1>
        <p className="subtitle">{mode === 'login' ? 'Welcome back' : 'Create your account'}</p>

        <form onSubmit={handleSubmit}>

          {mode === 'register' && (
            <>
              <div className="field-group">
                <label>Full Name</label>
                <input
                  name="fullName"
                  placeholder="John Doe"
                  value={form.fullName}
                  onChange={handle}
                />
                {errors.fullName && <span className="field-error">{errors.fullName}</span>}
              </div>
            </>
          )}

          <div className="field-group">
            <label>Username</label>
            <input
              name="username"
              placeholder="e.g. johndoe99"
              value={form.username}
              onChange={handle}
              autoCapitalize="none"
            />
            {errors.username && <span className="field-error">{errors.username}</span>}
          </div>

          {mode === 'register' && (
            <div className="field-group">
              <label>Mobile Number</label>
              <input
                name="mobile"
                placeholder="+91 9876543210"
                value={form.mobile}
                onChange={handle}
                type="tel"
              />
              {errors.mobile && <span className="field-error">{errors.mobile}</span>}
            </div>
          )}

          <div className="field-group">
            <label>{mode === 'register' ? 'Create Password' : 'Password'}</label>
            <div className="input-wrap">
              <input
                name="password"
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={handle}
              />
              <button type="button" className="eye-btn" onClick={() => setShowPwd(!showPwd)}>
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
            {strength && (
              <div className="strength-bar">
                <div className="strength-fill" style={{ width: strength.width, background: strength.color }} />
              </div>
            )}
            {strength && <span className="strength-label" style={{ color: strength.color }}>{strength.label} password</span>}
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          {mode === 'register' && (
            <div className="field-group">
              <label>Repeat Password</label>
              <div className="input-wrap">
                <input
                  name="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.confirmPassword}
                  onChange={handle}
                />
                <button type="button" className="eye-btn" onClick={() => setShowConfirm(!showConfirm)}>
                  {showConfirm ? '🙈' : '👁️'}
                </button>
              </div>
              {form.confirmPassword && (
                <span className="match-indicator">
                  {form.password === form.confirmPassword ? '✅ Passwords match' : '❌ Does not match'}
                </span>
              )}
              {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
            </div>
          )}

          {serverError && <div className="error">{serverError}</div>}

          <button type="submit" disabled={busy}>
            {busy ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="switch-mode">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <a onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErrors({}); setServerError(''); }}>
            {mode === 'login' ? 'Register' : 'Log In'}
          </a>
        </p>
        <p className="note">🔒 Your encryption keys are generated and stored only on this device.</p>
      </div>
    </div>
  );
}