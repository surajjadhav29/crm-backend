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
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  return /https:\/\/.*\.vercel\.(app|dev)$/i.test(origin);
}

const corsOptions = {
  origin(origin, callback) {
    return callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
};

module.exports = { corsOptions, isAllowedOrigin };
