const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
const auditRoutes = require('./routes/auditRoutes');
const userRoutes = require('./routes/userRoutes');
const sharedLinkRoutes = require('./routes/sharedLinkRoutes');
const folderRoutes = require('./routes/folderRoutes');
const accessRequestRoutes = require('./routes/accessRequestRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Trust proxy for Apache reverse proxy (X-Forwarded-For, X-Forwarded-Proto)
app.set('trust proxy', 1);

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Allowed origins for CORS (production naitik.app, api.naitik.app, and local dev)
const allowedOrigins = [
  config.clientUrl,
  'https://naitik.app',
  'http://naitik.app',
  'https://www.naitik.app',
  'http://www.naitik.app',
  'https://api.naitik.app',
  'http://api.naitik.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // allow curl, mobile clients, server-to-server, or postman
  if (allowedOrigins.includes(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)*naitik\.app(:\d+)?$/i.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return false;
};

// Secure CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'],
    exposedHeaders: ['Content-Disposition', 'Content-Range', 'Accept-Ranges', 'X-Encryption-IV', 'X-Encryption-Algorithm'],
  })
);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiter to general API
app.use('/api', apiLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SecureVault API',
    version: '1.0.0',
    s3Bucket: config.aws.bucket,
    s3Region: config.aws.region,
  });
});

// Mount application API routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/files', permissionRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shared', sharedLinkRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/access-requests', accessRequestRoutes);
app.use('/api/notifications', notificationRoutes);

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl} - Endpoint not found.`,
  });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
