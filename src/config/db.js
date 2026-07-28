const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  const uri = env.MONGODB_URI;
  if (!uri) {
    const error = new Error('MONGODB_URI is not set');
    error.code = 'MISSING_ENV';
    throw error;
  }

  // Already connected.
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Connecting — wait for the in-flight attempt.
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve, reject) => {
      const onConnected = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        mongoose.connection.off('connected', onConnected);
        mongoose.connection.off('error', onError);
      };
      mongoose.connection.once('connected', onConnected);
      mongoose.connection.once('error', onError);
    });
    return mongoose.connection;
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  console.log('MongoDB connected');
  return mongoose.connection;
}

// Memoized connection for serverless: connect once and reuse the promise across
// invocations. Resets on failure / disconnect so the next request can retry.
let dbConnectionPromise;

function ensureDatabaseConnection() {
  // If the socket dropped after a successful connect, force a fresh attempt.
  if (dbConnectionPromise && mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
    dbConnectionPromise = null;
  }

  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDB().catch((error) => {
      dbConnectionPromise = null;
      throw error;
    });
  }
  return dbConnectionPromise;
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, ensureDatabaseConnection, isConnected };
