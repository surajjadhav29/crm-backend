const env = require('./config/env');
const app = require('./app');
const { ensureDatabaseConnection } = require('./config/db');

function startServer(currentPort) {
  const server = app.listen(currentPort, () => {
    console.log(`Server listening on port ${currentPort}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = currentPort + 1;
      console.warn(`Port ${currentPort} is busy. Trying ${nextPort} instead.`);
      server.close(() => startServer(nextPort));
      return;
    }
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
}

// Only listen when run directly. When imported (e.g. by Vercel) the app is used
// as a serverless handler instead.
if (require.main === module) {
  ensureDatabaseConnection()
    .then(() => startServer(env.PORT))
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err.message);
      process.exit(1);
    });
}

module.exports = app;
