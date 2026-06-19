const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function register(username, password, publicKey, profile = {}) {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, publicKey, ...profile })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Register failed');
  return res.json();
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Login failed');
  return res.json();
}

export async function startDirectConversation(username) {
  const res = await fetch(`${API_BASE}/conversations/direct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to start conversation');
  return res.json();
}

export async function createGroupConversation(name, usernames) {
  const res = await fetch(`${API_BASE}/conversations/group`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, usernames })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create group');
  return res.json();
}

export async function getConversations() {
  const res = await fetch(`${API_BASE}/conversations`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load conversations');
  return res.json();
}

export async function getMessages(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Failed to load messages');
  return res.json();
}

export async function getUserStatus(userId) {
  const res = await fetch(`${API_BASE}/users/${userId}/status`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load status');
  return res.json();
}

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
