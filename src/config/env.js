require('dotenv').config();

// Centralized, validated access to environment variables. Import this instead
// of reading process.env directly so configuration lives in one place.
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-in-vercel-env',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '28h',
  CLIENT_URL: process.env.CLIENT_URL || '',
};

env.isProduction = env.NODE_ENV === 'production';

// Warn loudly if the JWT secret is left at its insecure default in production.
if (env.isProduction && env.JWT_SECRET === 'change-this-in-vercel-env') {
  console.warn('[config] JWT_SECRET is using an insecure default. Set JWT_SECRET in the environment.');
}

module.exports = env;
