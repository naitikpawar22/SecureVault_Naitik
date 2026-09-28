/**
 * SecureVault Zero-Knowledge Cryptography Engine
 * Built using the standard W3C Web Crypto API (SubtleCrypto).
 * - File Encryption: AES-256-GCM with unique 96-bit (12-byte) IVs.
 * - Key Agreement: ECDH with NIST P-256 curve.
 * - Key Encryption Key (KEK): PBKDF2 (SHA-256, 100,000 iterations).
 */

// Helper: Convert ArrayBuffer to Hex String
export function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper: Convert Hex String to Uint8Array
export function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Helper: Convert ArrayBuffer to Base64
export function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper: Convert Base64 to ArrayBuffer
export function base64ToBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 1. User Asymmetric Key Generation (ECDH P-256)
 */
export async function generateUserKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['deriveKey', 'deriveBits']
  );
  return keyPair;
}

/**
 * Export ECDH Public Key as JSON Web Key (JWK)
 */
export async function exportPublicKey(key) {
  return await window.crypto.subtle.exportKey('jwk', key);
}

/**
 * Export ECDH Private Key as JWK
 */
export async function exportPrivateKey(key) {
  return await window.crypto.subtle.exportKey('jwk', key);
}

/**
 * Import ECDH Public Key from JWK
 */
export async function importPublicKey(jwk) {
  const parsed = typeof jwk === 'string' ? JSON.parse(jwk) : jwk;
  return await window.crypto.subtle.importKey(
    'jwk',
    parsed,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

/**
 * Import ECDH Private Key from JWK
 */
export async function importPrivateKey(jwk) {
  const parsed = typeof jwk === 'string' ? JSON.parse(jwk) : jwk;
  return await window.crypto.subtle.importKey(
    'jwk',
    parsed,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * 2. Password-Derived Key (PBKDF2) for Protecting Private Key
 */
async function derivePasswordKey(password, salt) {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt User Private Key with Password KEK
 */
export async function encryptPrivateKeyWithPassword(privateKeyJwk, password) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const kek = await derivePasswordKey(password, salt);

  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(privateKeyJwk));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    plaintext
  );

  return {
    ciphertext: bufferToBase64(encryptedBuffer),
    salt: bufferToHex(salt),
    iv: bufferToHex(iv),
  };
}

/**
 * Decrypt User Private Key using Password
 */
export async function decryptPrivateKeyWithPassword(bundle, password) {
  const salt = hexToBuffer(bundle.salt);
  const iv = hexToBuffer(bundle.iv);
  const ciphertextBuffer = base64ToBuffer(bundle.ciphertext);

  const kek = await derivePasswordKey(password, salt);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    kek,
    ciphertextBuffer
  );

  const dec = new TextDecoder();
  const jwk = JSON.parse(dec.decode(decryptedBuffer));
  return await importPrivateKey(jwk);
}

/**
 * 3. File Symmetric Key Generation (AES-256-GCM)
 */
export async function generateFileKey() {
  return await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt File Bytes using AES-256-GCM
 */
export async function encryptFile(arrayBuffer, fek) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit standard IV

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    fek,
    arrayBuffer
  );

  return {
    encryptedBuffer,
    iv: bufferToHex(iv),
  };
}

/**
 * Decrypt File Bytes using AES-256-GCM
 */
export async function decryptFile(encryptedBuffer, fek, ivHex) {
  const iv = hexToBuffer(ivHex);

  return await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    fek,
    encryptedBuffer
  );
}

/**
 * 4. ECDH Key Agreement & File Key Wrapping
 * Wrap a File Encryption Key (FEK) for a recipient using ECDH
 */
export async function wrapFileKeyForRecipient(fek, recipientPublicKeyJwk) {
  // 1. Export raw FEK bytes
  const rawFek = await window.crypto.subtle.exportKey('raw', fek);

  // 2. Generate ephemeral ECDH keypair
  const ephemeralKeyPair = await generateUserKeyPair();

  // 3. Import recipient's public key
  const recipientKey = await importPublicKey(recipientPublicKeyJwk);

  // 4. Derive shared wrapping key using ECDH
  const wrappingKey = await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: recipientKey,
    },
    ephemeralKeyPair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // 5. Encrypt FEK using wrapping key
  const wrapIv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrappedKeyBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIv },
    wrappingKey,
    rawFek
  );

  const ephemeralPublicJwk = await exportPublicKey(ephemeralKeyPair.publicKey);

  return {
    ephemeralPublicKey: ephemeralPublicJwk,
    wrapIv: bufferToHex(wrapIv),
    wrappedKey: bufferToBase64(wrappedKeyBuffer),
  };
}

/**
 * Unwrap a File Encryption Key (FEK) using recipient's ECDH Private Key
 */
export async function unwrapFileKey(wrappedBundle, recipientPrivateKey) {
  // 1. Import ephemeral public key
  const ephemeralKey = await importPublicKey(wrappedBundle.ephemeralPublicKey);

  // 2. Derive the exact same shared wrapping key
  const wrappingKey = await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: ephemeralKey,
    },
    recipientPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // 3. Decrypt the wrapped key bytes
  const wrapIv = hexToBuffer(wrappedBundle.wrapIv);
  const wrappedBytes = base64ToBuffer(wrappedBundle.wrappedKey);

  const rawFek = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: wrapIv },
    wrappingKey,
    wrappedBytes
  );

  // 4. Import raw FEK into AES-256-GCM CryptoKey
  return await window.crypto.subtle.importKey(
    'raw',
    rawFek,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Import raw AES-256-GCM CryptoKey from Base64 string
 */
export async function importFileKeyFromBase64(base64Key) {
  if (!base64Key || typeof base64Key !== 'string') {
    throw new Error('A valid Base64 key string is required');
  }
  let cleanBase64 = base64Key.trim();
  // Query param '+' may have been parsed as space
  if (cleanBase64.includes(' ') && !cleanBase64.includes('+')) {
    cleanBase64 = cleanBase64.replace(/ /g, '+');
  }

  const binaryString = window.atob(cleanBase64);
  const keyBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyBytes[i] = binaryString.charCodeAt(i);
  }

  return await window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export AES-256-GCM CryptoKey to Base64 string
 */
export async function exportFileKeyToBase64(fek) {
  const rawKey = await window.crypto.subtle.exportKey('raw', fek);
  return bufferToBase64(rawKey);
}

