const rateLimit = require('express-rate-limit');

// General API rate limiter (30 seconds window)
const apiLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 30 seconds.',
  },
});

// Limiter for authentication endpoints (30 seconds window)
const authLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: process.env.NODE_ENV === 'production' ? 15 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again after 30 seconds.',
  },
});

// File upload rate limiter (30 seconds window)
const uploadLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Upload limit reached. Please wait 30 seconds before uploading more files.',
  },
});

// Limiter for MFA verification attempts (30 seconds window)
const mfaLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many MFA verification attempts. Please wait 30 seconds and try again.',
  },
});

// Limiter for access request creation (30 seconds window)
const accessRequestLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: process.env.NODE_ENV === 'production' ? 15 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many access requests sent. Please wait 30 seconds before trying again.',
  },
});

// High-capacity limiter for chunked multipart uploads (allowing high-speed concurrent chunk streams)
const chunkUploadLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: process.env.NODE_ENV === 'production' ? 1500 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Chunk stream rate limit exceeded. Please wait a moment.',
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  chunkUploadLimiter,
  mfaLimiter,
  accessRequestLimiter,
};
