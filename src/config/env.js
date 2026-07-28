require('dotenv').config();

// Centralized, validated access to environment variables. Import this instead
// of reading process.env directly so configuration lives in one place.
const INSECURE_JWT_DEFAULT = 'change-this-in-vercel-env';
const MIN_JWT_SECRET_LENGTH = 32;

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || INSECURE_JWT_DEFAULT,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  CLIENT_URL: process.env.CLIENT_URL || '',
};

env.isProduction = env.NODE_ENV === 'production';

function assertSecureJwtSecret() {
  const secret = env.JWT_SECRET;
  const insecure =
    !secret ||
    secret === INSECURE_JWT_DEFAULT ||
    secret.length < MIN_JWT_SECRET_LENGTH;

  if (!insecure) return;

  const message =
    `[config] JWT_SECRET is missing, too short (min ${MIN_JWT_SECRET_LENGTH}), ` +
    'or still using the insecure default. Set a strong JWT_SECRET in the environment.';

  if (env.isProduction) {
    console.error(message);
    process.exit(1);
  }

  console.warn(`${message} (allowed in development only)`);
}

assertSecureJwtSecret();

module.exports = env;
