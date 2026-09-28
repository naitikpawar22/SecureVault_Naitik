const app = require('./app');
const config = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

const PORT = config.port || 5000;

const startServer = async () => {
  try {
    // 1. Establish database connection
    await connectDB();

    // 2. Start HTTP server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`  SecureVault API Server running on port ${PORT}`);
      console.log(`  Environment: ${config.nodeEnv}`);
      console.log(`  Database URI configured: ${config.mongoUri.split('@').pop()}`);
      console.log(`  Health Check: http://localhost:${PORT}/api/health`);
      console.log(`====================================================`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Gracefully shutting down...`);
      server.close(async () => {
        try {
          await disconnectDB();
          console.log('[Server] Connections closed. Exiting process.');
          process.exit(0);
        } catch (err) {
          console.error('[Server Error during shutdown]:', err.message);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[Server Fatal] Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();
