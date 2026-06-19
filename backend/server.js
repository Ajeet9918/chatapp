
const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// ---------- Helpers ----------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing token' });
  try {
    const token = header.replace('Bearer ', '');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------- Auth Routes ----------

// Register: client generates its own ECDH keypair, sends only the PUBLIC key
app.post('/api/register', async (req, res) => {
  const { username, password, publicKey, fullName, mobile } = req.body;
  if (!username || !password || !publicKey) {
    return res.status(400).json({ error: 'username, password, publicKey required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username taken' });

  // Check mobile not already registered
  if (mobile) {
    const mobileExists = db.prepare('SELECT id FROM users WHERE mobile = ?').get(mobile);
    if (mobileExists) return res.status(409).json({ error: 'Mobile number already registered' });
  }

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id, username, password_hash, full_name, mobile, public_key) VALUES (?,?,?,?,?,?)')
    .run(id, username, hash, fullName || null, mobile || null, publicKey);

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id, username, fullName, mobile } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, publicKey: user.public_key } });
});

// Get a user's public key (needed before starting an encrypted chat with them)
app.get('/api/users/:username/key', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, public_key FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, publicKey: user.public_key });
});

const onlineUsers = new Map(); // userId -> socketId

// Get a user's online status + last seen
app.get('/api/users/:id/status', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, last_seen FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id,
    username: user.username,
    online: onlineUsers.has(user.id),
    lastSeen: user.last_seen * 1000 // ms
  });
});

// ---------- Conversations ----------

// Create or get a 1:1 conversation with another user
app.post('/api/conversations/direct', authMiddleware, (req, res) => {
  const { username } = req.body;
  const other = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!other) return res.status(404).json({ error: 'User not found' });

  // Check if a direct conversation already exists between these two users
  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
    JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
    WHERE c.is_group = 0
  `).get(req.user.id, other.id);

  let convId;
  if (existing) {
    convId = existing.id;
  } else {
    convId = uuidv4();
    db.prepare('INSERT INTO conversations (id, is_group, name) VALUES (?,0,?)').run(convId, null);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)').run(convId, req.user.id);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)').run(convId, other.id);
  }

  res.json({
    conversationId: convId,
    peer: { id: other.id, username: other.username, publicKey: other.public_key }
  });
});

// Create a group conversation
app.post('/api/conversations/group', authMiddleware, (req, res) => {
  const { name, usernames } = req.body; // usernames: array of member usernames
  const convId = uuidv4();
  db.prepare('INSERT INTO conversations (id, is_group, name) VALUES (?,1,?)').run(convId, name);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)').run(convId, req.user.id);

  const members = [{ id: req.user.id, username: req.user.username }];
  for (const uname of usernames) {
    const u = db.prepare('SELECT id, username, public_key FROM users WHERE username = ?').get(uname);
    if (u) {
      db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?,?)').run(convId, u.id);
      members.push({ id: u.id, username: u.username, publicKey: u.public_key });
    }
  }
  res.json({ conversationId: convId, name, members });
});

// List my conversations
app.get('/api/conversations', authMiddleware, (req, res) => {
  const convs = db.prepare(`
    SELECT c.id, c.is_group, c.name FROM conversations c
    JOIN conversation_members m ON m.conversation_id = c.id
    WHERE m.user_id = ?
  `).all(req.user.id);

  // attach member usernames for each conversation
  const result = convs.map(c => {
    const members = db.prepare(`
      SELECT u.id, u.username, u.public_key FROM conversation_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.conversation_id = ?
    `).all(c.id);
    return { ...c, members };
  });

  res.json(result);
});

// Fetch message history (ciphertext) for a conversation
app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const msgs = db.prepare(`
    SELECT id, sender_id, ciphertext, iv, created_at, delivered, read_at
    FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
  `).all(req.params.id);

  res.json(msgs);
});

// ---------- Socket.IO (real-time relay) ----------

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (e) {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  onlineUsers.set(socket.user.id, socket.id);
  io.emit('presence', { userId: socket.user.id, online: true });

  // Join all conversation rooms this user belongs to
  const convs = db.prepare('SELECT conversation_id FROM conversation_members WHERE user_id=?').all(socket.user.id);
  convs.forEach(c => socket.join(c.conversation_id));

  // Client sends an already-encrypted message: { conversationId, ciphertext, iv }
  socket.on('message:send', (data) => {
    const { conversationId, ciphertext, iv } = data;

    const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?')
      .get(conversationId, socket.user.id);
    if (!member) return;

    const id = uuidv4();
    const createdAt = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, ciphertext, iv, created_at)
      VALUES (?,?,?,?,?,?)
    `).run(id, conversationId, socket.user.id, ciphertext, iv, createdAt);

    const payload = {
      id,
      conversationId,
      senderId: socket.user.id,
      ciphertext,
      iv,
      createdAt: createdAt * 1000,
      delivered: 0,
      read_at: null
    };

    // Relay to everyone in the room (including sender, for multi-device sync)
    io.to(conversationId).emit('message:new', payload);
  });

  // Recipient's client acknowledges it received the message (delivered = single grey tick -> double grey)
  socket.on('message:delivered', ({ conversationId, messageId }) => {
    db.prepare('UPDATE messages SET delivered = 1 WHERE id = ? AND sender_id != ?').run(messageId, socket.user.id);
    io.to(conversationId).emit('message:status', { messageId, status: 'delivered' });
  });

  // Recipient's client reports the message was viewed (read = blue double tick)
  socket.on('message:read', ({ conversationId, messageIds }) => {
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare('UPDATE messages SET delivered = 1, read_at = ? WHERE id = ? AND sender_id != ?');
    for (const messageId of messageIds) {
      stmt.run(now, messageId, socket.user.id);
    }
    io.to(conversationId).emit('message:status', { messageIds, status: 'read', readAt: now * 1000 });
  });

  socket.on('typing', ({ conversationId, isTyping }) => {
    socket.to(conversationId).emit('typing', { conversationId, userId: socket.user.id, isTyping });
  });

  socket.on('call:invite', ({ conversationId, callType }) => {
    socket.to(conversationId).emit('call:invite', {
      conversationId,
      callType,
      fromUserId: socket.user.id,
      fromUsername: socket.user.username
    });
  });

  socket.on('call:offer', ({ conversationId, sdp }) => {
    socket.to(conversationId).emit('call:offer', { conversationId, sdp, fromUserId: socket.user.id });
  });

  socket.on('call:answer', ({ conversationId, sdp }) => {
    socket.to(conversationId).emit('call:answer', { conversationId, sdp, fromUserId: socket.user.id });
  });

  socket.on('call:ice-candidate', ({ conversationId, candidate }) => {
    socket.to(conversationId).emit('call:ice-candidate', { conversationId, candidate, fromUserId: socket.user.id });
  });

  socket.on('call:end', ({ conversationId }) => {
    socket.to(conversationId).emit('call:end', { conversationId, fromUserId: socket.user.id });
  });

  socket.on('call:reject', ({ conversationId }) => {
    socket.to(conversationId).emit('call:reject', { conversationId, fromUserId: socket.user.id });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.user.id);
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, socket.user.id);
    io.emit('presence', { userId: socket.user.id, online: false, lastSeen: now * 1000 });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Chat backend running on port ${PORT}`));
