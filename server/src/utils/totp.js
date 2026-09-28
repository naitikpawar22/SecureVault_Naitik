const crypto = require('crypto');
const QRCode = require('qrcode');

// Base32 alphabet (RFC 4648)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a buffer to Base32 string
 * @param {Buffer} buffer
 * @returns {string}
 */
const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
};

/**
 * Decode a Base32 string to Buffer
 * @param {string} input
 * @returns {Buffer}
 */
const base32Decode = (input) => {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

/**
 * Generate a random Base32 secret for TOTP (160 bits / 20 bytes)
 * @returns {string}
 */
const generateSecret = () => {
  const randomBytes = crypto.randomBytes(20);
  return base32Encode(randomBytes);
};

/**
 * Generate a 6-digit TOTP code for a secret at a specific timestamp or counter
 * @param {string} secret Base32-encoded secret
 * @param {number} [timeCounter] Optional counter (defaults to current time / 30s)
 * @returns {string} 6-digit TOTP code
 */
const generateOtp = (secret, timeCounter = null) => {
  if (timeCounter === null) {
    timeCounter = Math.floor(Date.now() / 1000 / 30);
  }

  const key = base32Decode(secret);

  // Counter as 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(timeCounter));

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
};

/**
 * Verify a 6-digit TOTP code against a secret with window tolerance
 * @param {string} token 6-digit code provided by user
 * @param {string} secret Base32-encoded secret
 * @param {number} [window=1] Tolerance steps (1 step = 30 seconds before/after)
 * @returns {boolean}
 */
const verifyOtp = (token, secret, window = 1) => {
  if (!token || !secret) return false;
  const cleanToken = token.toString().trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  for (let offset = -window; offset <= window; offset++) {
    try {
      const generated = generateOtp(secret, currentCounter + offset);
      if (crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(cleanToken))) {
        return true;
      }
    } catch {
      // Continue to next window offset
    }
  }

  return false;
};

/**
 * Generate otpauth URL for authenticator apps
 * @param {string} email
 * @param {string} secret
 * @param {string} [issuer='SecureVault']
 * @returns {string}
 */
const getOtpAuthUrl = (email, secret, issuer = 'SecureVault') => {
  const encodedEmail = encodeURIComponent(email);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
};

/**
 * Generate QR Code data URL for authenticator app scanning
 * @param {string} email
 * @param {string} secret
 * @param {string} [issuer='SecureVault']
 * @returns {Promise<string>}
 */
const generateQrCodeDataUrl = async (email, secret, issuer = 'SecureVault') => {
  const url = getOtpAuthUrl(email, secret, issuer);
  return await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
    width: 240,
  });
};

module.exports = {
  generateSecret,
  generateOtp,
  verifyOtp,
  getOtpAuthUrl,
  generateQrCodeDataUrl,
  base32Encode,
  base32Decode,
};
