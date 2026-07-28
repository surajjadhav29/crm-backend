const env = require('./env');

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

const configuredOrigins = env.CLIENT_URL.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

function isAllowedOrigin(origin) {
  // Non-browser / same-origin tools (curl, server-to-server) send no Origin.
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  // Preview deployments only in non-production.
  if (!env.isProduction && /https:\/\/.*\.vercel\.(app|dev)$/i.test(origin)) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

module.exports = { corsOptions, isAllowedOrigin };
