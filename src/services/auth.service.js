const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

async function login({ username, password } = {}) {
  if (!username || !password) {
    throw ApiError.badRequest('Username and password are required');
  }

  const login = username.trim().toLowerCase();
  const user = await User.findOne({ $or: [{ username: login }, { email: login }] });
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid username or password');
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid username or password');
  }

  return { token: signToken(user), user: user.toJSON() };
}

module.exports = { login };
