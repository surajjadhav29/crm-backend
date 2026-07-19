const { ensureDatabaseConnection } = require('../config/db');

// Ensures the database is connected before handling any API request.
// Serverless-friendly: the connection promise is memoized in config/db.
async function ensureDb(req, res, next) {
  try {
    await ensureDatabaseConnection();
    next();
  } catch (error) {
    if (error.code === 'MISSING_ENV') {
      return res.status(503).json({ error: 'Database is not configured', message: error.message });
    }
    next(error);
  }
}

module.exports = ensureDb;
