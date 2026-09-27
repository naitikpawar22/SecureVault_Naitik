const dns = require('dns');
// Set public DNS to resolve MongoDB Atlas SRV records reliably across all ISPs
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore in environments where setting DNS servers is restricted
}

const mongoose = require('mongoose');
const config = require('./env');

let memoryServer = null;

const connectDB = async () => {
  let uri = config.mongoUri;

  // Sanitize URI if placeholder brackets exist: <username> -> username
  if (uri && (uri.includes('<') || uri.includes('>'))) {
    uri = uri.replace(/<([^>]+)>/g, '$1');
  }

  // Ensure database name is appended if not present
  if (uri && !uri.includes('/securevault') && uri.includes('.mongodb.net/')) {
    uri = uri.replace('.mongodb.net/', '.mongodb.net/securevault');
  }

  try {
    console.log('[Database] Connecting to MongoDB Atlas...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`[Database] MongoDB Atlas Connected successfully: ${mongoose.connection.name}`);
  } catch (err) {
    console.warn(`[Database Warning] Atlas connection failed: ${err.message}`);
    
    if (config.nodeEnv === 'development' || !process.env.NODE_ENV) {
      console.log('[Database] Attempting development in-memory MongoDB fallback...');
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create();
        const memUri = memoryServer.getUri();
        await mongoose.connect(memUri);
        console.log(`[Database] Connected to In-Memory MongoDB for local development: ${memUri}`);
      } catch (memErr) {
        console.error('[Database Fatal] In-memory database failed:', memErr.message);
        throw err;
      }
    } else {
      throw err;
    }
  }

  mongoose.connection.on('error', (err) => {
    console.error('[Database Error]', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Database Disconnected] Lost connection to MongoDB.');
  });
};

const disconnectDB = async () => {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
  }
};

module.exports = { connectDB, disconnectDB };
