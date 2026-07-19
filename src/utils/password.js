const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 6;

function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, comparePassword, MIN_PASSWORD_LENGTH };
