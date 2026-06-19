export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable
    ['deriveKey']
  );
}

export async function exportPublicKey(publicKey) {
  const raw = await crypto.subtle.exportKey('raw', publicKey);
  return arrayBufferToBase64(raw);
}

export async function importPublicKey(base64) {
  const raw = base64ToArrayBuffer(base64);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

export async function exportPrivateKey(privateKey) {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  return JSON.stringify(jwk);
}

export async function importPrivateKey(jwkString) {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
}
export async function saveKeyPairLocally(keyPair) {
  const privJwk = await exportPrivateKey(keyPair.privateKey);
  const pubB64 = await exportPublicKey(keyPair.publicKey);
  localStorage.setItem('e2ee_private_key', privJwk);
  localStorage.setItem('e2ee_public_key', pubB64);
}

export async function loadLocalKeyPair() {
  const privJwk = localStorage.getItem('e2ee_private_key');
  const pubB64 = localStorage.getItem('e2ee_public_key');
  if (!privJwk || !pubB64) return null;
  return {
    privateKey: await importPrivateKey(privJwk),
    publicKey: await importPublicKey(pubB64),
    publicKeyB64: pubB64
  };
}
export async function generateFreshKeyPair() {
  const generated = await generateKeyPair();
  await saveKeyPairLocally(generated);
  const kp = await loadLocalKeyPair();
  return kp;
}

// Load existing keypair (call this on login)
export async function ensureLocalKeyPair() {
  let kp = await loadLocalKeyPair();
  if (!kp) {
    const generated = await generateKeyPair();
    await saveKeyPairLocally(generated);
    kp = await loadLocalKeyPair();
  }
  return kp;
}

export async function deriveSharedKey(myPrivateKey, theirPublicKeyB64) {
  const theirPublicKey = await importPublicKey(theirPublicKeyB64);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable - stays in memory only
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(sharedKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoded
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertextBuf),
    iv: arrayBufferToBase64(iv)
  };
}

export async function decryptMessage(sharedKey, ciphertextB64, ivB64) {
  try {
    const ciphertext = base64ToArrayBuffer(ciphertextB64);
    const iv = base64ToArrayBuffer(ivB64);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      sharedKey,
      ciphertext
    );
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    return '[Unable to decrypt message]';
  }
}

// ---------- Base64 helpers ----------

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
