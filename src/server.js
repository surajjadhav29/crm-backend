const env = require('./config/env');
const app = require('./app');
const { ensureDatabaseConnection } = require('./config/db');
const File = require('./models/File');

function startServer(currentPort) {
  const server = app.listen(currentPort, () => {
    console.log(`Server listening on port ${currentPort}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${currentPort} is already in use. Stop the other process or set PORT to a free port. ` +
          '(The Vite dev proxy expects the API on port 5000 by default.)'
      );
      process.exit(1);
    }
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
}

// Only listen when run directly. When imported (e.g. by Vercel) the app is used
// as a serverless handler instead.
if (require.main === module) {
  ensureDatabaseConnection()
    .then(async () => {
      // Drop old vehicleNo-only unique index; ensure compound (vehicleNo + workType).
      try {
        await File.syncIndexes();
      } catch (err) {
        console.warn('File.syncIndexes:', err.message);
      }
      startServer(env.PORT);
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err.message);
      process.exit(1);
    });
}

module.exports = app;
