# E2EE Chat App — Starter

A real-time chat application with **end-to-end encryption** for direct messages,
built with React + Node.js/Express + Socket.IO.

## How the encryption works

- On registration, your browser generates an **ECDH (P-256) keypair**.
  - The **private key** is stored only in `localStorage` on your device — never sent anywhere.
  - The **public key** is sent to the server so other users can find it.
- When you start a chat with someone, your browser derives a **shared AES-256 key**
  using ECDH (Elliptic Curve Diffie-Hellman) — this matches the key the other person derives too.
- Every message is encrypted with **AES-GCM** *before* leaving your browser.
- The server (`server.js`/`db.js`) only ever stores/relays **ciphertext + IV**. It cannot read your messages.

> ⚠️ This is a solid educational/prototype foundation. For production, consider:
> - Migrating to the **Signal Protocol** (libsignal) for forward secrecy & proper group E2EE
> - Per-device key management (multiple devices per user)
> - Verified key fingerprints ("safety numbers") so users can detect MITM

## Project structure

```
chat-app/
├── backend/          Node.js + Express + Socket.IO + SQLite
│   ├── server.js     API routes + real-time message relay
│   ├── db.js         SQLite schema
│   └── package.json
└── frontend/          React (Vite)
    ├── src/
    │   ├── crypto.js      <- E2EE logic (Web Crypto API)
    │   ├── api.js         <- REST API client
    │   ├── App.jsx
    │   ├── Auth.jsx       <- Login/Register
    │   ├── ChatLayout.jsx <- Sidebar + conversation list
    │   ├── ChatWindow.jsx <- Encrypted chat UI
    │   └── styles.css
    └── package.json
```

## Running it locally

### 1. Backend

```bash
cd backend
npm install
npm start
```

This starts the API + Socket.IO server on **http://localhost:4000** and creates a local `chat.db` SQLite file.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

This starts the React app on **http://localhost:5173**.

### 3. Try it out

1. Open the app in two different browsers (or one normal + one incognito window) to simulate two users.
2. Register two accounts, e.g. `alice` and `bob`.
3. As `alice`, type `bob` in "Start chat with username..." and hit enter.
4. Send messages — they're encrypted client-side before being sent!

You can verify the server never sees plaintext by inspecting the `messages` table in `chat.db`
(only `ciphertext` and `iv` columns are populated).

## Next steps / roadmap

- **Group chats**: current implementation derives a shared key with only one other
  member as a placeholder. Implement Sender Keys (Signal protocol) for proper multi-party E2EE.
- **Mobile app**: port `crypto.js` logic to React Native using `react-native-quick-crypto`
  or a libsignal binding; reuse the same backend API & Socket.IO events.
- **Media/file sharing**: encrypt files client-side before upload (same AES-GCM key).
- **Push notifications**: send encrypted payloads through APNs/FCM; decrypt on-device.
- **Multi-device support**: register multiple public keys per user, encrypt each message
  separately for each of the recipient's devices.
- **Key verification UI**: show a "safety number" (hash of both public keys) so users
  can verify they're not victims of a man-in-the-middle attack.
