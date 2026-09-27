const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment files in priority order
const serverDir = path.resolve(__dirname, '../../');
const rootDir = path.resolve(__dirname, '../../../');

// 1. Load base .env
const envPath = path.join(serverDir, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// 2. Load DB.env (priority: server/DB.env or server/db.env, then root fallback)
const loadDbEnv = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8').trim();
  dotenv.config({ path: filePath });
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('MONGODB_URI=')) {
      process.env.MONGODB_URI = trimmed.replace('MONGODB_URI=', '').trim();
    } else if (trimmed.startsWith('DB_NAME=')) {
      process.env.DB_NAME = trimmed.replace('DB_NAME=', '').trim();
    } else if (trimmed.startsWith('mongodb://') || trimmed.startsWith('mongodb+srv://')) {
      process.env.MONGODB_URI = trimmed;
    }
  });
};

[
  path.join(serverDir, 'DB.env'),
  path.join(serverDir, 'db.env'),
  path.join(rootDir, 'DB.env'),
  path.join(rootDir, 'db.env'),
].forEach(loadDbEnv);

// 3. Load S3.env (priority: server/S3.env or server/s3.env, then root fallback)
const parseS3Lines = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.includes('Access key ID:-')) {
      process.env.AWS_ACCESS_KEY_ID = trimmed.replace('Access key ID:-', '').trim();
    } else if (trimmed.includes('Secret access key:-')) {
      process.env.AWS_SECRET_ACCESS_KEY = trimmed.replace('Secret access key:-', '').trim();
    } else if (trimmed.includes('Bucket Name:-') || trimmed.includes('Bucket:-')) {
      process.env.AWS_S3_BUCKET = trimmed.split(':-')[1].trim();
    } else if (trimmed.startsWith('Name:-')) {
      process.env.AWS_S3_BUCKET = trimmed.replace('Name:-', '').trim();
    } else if (trimmed.includes('Region:-')) {
      process.env.AWS_REGION = trimmed.split(':-')[1].trim();
    }
  });
  dotenv.config({ path: filePath });
};

[
  path.join(serverDir, 'S3.env'),
  path.join(serverDir, 's3.env'),
  path.join(rootDir, 'S3.env'),
  path.join(rootDir, 's3.env'),
].forEach(parseS3Lines);

// Ensure defaults
const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'securevault_fallback_jwt_secret_key_change_in_prod_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/securevault',
  dbName: process.env.DB_NAME || 'securevault',
  aws: {
    region: process.env.AWS_REGION || 'eu-north-1',
    bucket: process.env.AWS_S3_BUCKET || 'securevault-naitik-files-2026',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
};

module.exports = config;
