const Database = require('better-sqlite3');
const db = new Database('chat.db');

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  mobile TEXT,
  public_key TEXT,
  last_seen INTEGER DEFAULT (strftime('%s','now')),
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  is_group INTEGER DEFAULT 0,
  name TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

-- Messages store ONLY ciphertext + metadata needed to decrypt (iv, sender info).
-- The server never sees plaintext.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT,          -- for 1:1; null for group (uses per-member ciphertext table below)
  ciphertext TEXT NOT NULL,   -- base64
  iv TEXT NOT NULL,           -- base64 nonce for AES-GCM
  created_at INTEGER DEFAULT (strftime('%s','now')),
  delivered INTEGER DEFAULT 0,
  read_at INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
`);

module.exports = db;
