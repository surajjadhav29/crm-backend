const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  const uri = env.MONGODB_URI;
  if (!uri) {
    const error = new Error('MONGODB_URI is not set');
    error.code = 'MISSING_ENV';
    throw error;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
    });
    return mongoose.connection;
  }

  await mongoose.connect(uri);
  console.log('MongoDB connected');
  return mongoose.connection;
}

// Memoized connection for serverless: connect once and reuse the promise across
// invocations. Resets on failure so the next request can retry.
let dbConnectionPromise;

function ensureDatabaseConnection() {
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
