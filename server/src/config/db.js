const dns = require('dns');
// Set public DNS to resolve DNS records reliably across all ISPs
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  // Ignore in environments where setting DNS servers is restricted
}

const mongoose = require('mongoose');
const config = require('./env');

let memoryServer = null;

// Canonical direct MongoDB Atlas replica set URI for cluster0.tic8z6t.mongodb.net
const ATLAS_DIRECT_REPLICA_URI =
  'mongodb://itsnaitu_db_user:36KqPdIxVjuPMbYA@ac-xjxjhjt-shard-00-00.tic8z6t.mongodb.net:27017,ac-xjxjhjt-shard-00-01.tic8z6t.mongodb.net:27017,ac-xjxjhjt-shard-00-02.tic8z6t.mongodb.net:27017/securevault?ssl=true&replicaSet=atlas-qacj0v-shard-0&authSource=admin&retryWrites=true&w=majority';

const connectDB = async () => {
  let primaryUri = config.mongoUri;

  // Sanitize URI if placeholder brackets exist: <username> -> username
  if (primaryUri && (primaryUri.includes('<') || primaryUri.includes('>'))) {
    primaryUri = primaryUri.replace(/<([^>]+)>/g, '$1');
  }

  // Ensure database name is appended if not present
  if (primaryUri && !primaryUri.includes('/securevault') && primaryUri.includes('.mongodb.net/')) {
    primaryUri = primaryUri.replace('.mongodb.net/', '.mongodb.net/securevault');
  }

  // Determine connection candidates
  const connectionCandidates = [];

  // If primaryUri contains SRV and mentions cluster0.tic8z6t, prioritize direct replica set
  if (primaryUri && primaryUri.includes('cluster0.tic8z6t.mongodb.net')) {
    connectionCandidates.push({
      name: 'Atlas Direct Shard ReplicaSet (Bypasses SRV DNS)',
      uri: ATLAS_DIRECT_REPLICA_URI,
    });
    connectionCandidates.push({
      name: 'Atlas Primary Configured URI',
      uri: primaryUri,
    });
  } else {
    if (primaryUri) {
      connectionCandidates.push({
        name: 'Configured MongoDB URI',
        uri: primaryUri,
      });
    }
    connectionCandidates.push({
      name: 'Atlas Direct Shard ReplicaSet Fallback',
      uri: ATLAS_DIRECT_REPLICA_URI,
    });
  }

  let connected = false;
  let lastError = null;

  for (const candidate of connectionCandidates) {
    try {
      console.log(`[Database] Attempting connection via: ${candidate.name}...`);
      await mongoose.connect(candidate.uri, {
        serverSelectionTimeoutMS: 6000,
        connectTimeoutMS: 6000,
      });
      console.log(`[Database] MongoDB Atlas Connected successfully!`);
      console.log(`  Database: ${mongoose.connection.name}`);
      console.log(`  Host: ${mongoose.connection.host}`);
      console.log(`  Persistent Cloud: YES (Atlas ReplicaSet)`);
      connected = true;
      break;
    } catch (err) {
      console.warn(`[Database Warning] ${candidate.name} failed: ${err.message}`);
      lastError = err;
    }
  }

  if (!connected) {
    if (config.nodeEnv === 'test') {
      console.log('[Database] Using MongoMemoryServer for automated test suite...');
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create();
        const memUri = memoryServer.getUri();
        await mongoose.connect(memUri);
        console.log(`[Database] Connected to In-Memory MongoDB: ${memUri}`);
      } catch (memErr) {
        console.error('[Database Fatal] In-memory database failed:', memErr.message);
        throw lastError || memErr;
      }
    } else {
      console.error('[Database Fatal] All MongoDB Atlas connection attempts failed.');
      throw lastError;
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
