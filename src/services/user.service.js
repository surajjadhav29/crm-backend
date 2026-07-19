const User = require('../models/User');
const File = require('../models/File');
const ApiError = require('../utils/apiError');
const { hashPassword, MIN_PASSWORD_LENGTH } = require('../utils/password');

const ROLES = ['superadmin', 'staff'];

// Maximum number of manageable users (matches the admin UI). The built-in
// system account is excluded from this count.
const MAX_USERS = 6;
const SYSTEM_ACCOUNT_EMAIL = 'superadmin@autoaxis.com';

async function generateUsername(email) {
  const base = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'user';
  let candidate = base;
  let counter = 1;
  while (await User.exists({ username: candidate })) {
    candidate = `${base}${counter}`;
    counter += 1;
  }
  return candidate;
}

async function listUsers() {
  const users = await User.find().sort({ createdAt: -1 });
  return users.map((u) => u.toJSON());
}

async function createUser({ fullName, email, role, password } = {}) {
  if (!fullName || !email || !role || !password) {
    throw ApiError.badRequest('fullName, email, role and password are required');
  }
  if (!ROLES.includes(role)) {
    throw ApiError.badRequest('Invalid role');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) {
    throw ApiError.conflict('A user with this email already exists');
  }

  const userCount = await User.countDocuments({ email: { $ne: SYSTEM_ACCOUNT_EMAIL } });
  if (userCount >= MAX_USERS) {
    throw ApiError.badRequest(
      `User limit reached. You can create at most ${MAX_USERS} users.`,
      'USER_LIMIT_REACHED'
    );
  }

  const user = await User.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    username: await generateUsername(normalizedEmail),
    passwordHash: await hashPassword(password),
    role,
    isActive: true,
  });

  return user.toJSON();
}

async function updateUser(id, { fullName, email, role, password } = {}) {
  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  if (role && !ROLES.includes(role)) {
    throw ApiError.badRequest('Invalid role');
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  // Never allow the last remaining superadmin to be demoted — it would lock
  // everyone out of user management.
  if (role && role !== 'superadmin' && user.role === 'superadmin') {
    const superadminCount = await User.countDocuments({ role: 'superadmin' });
    if (superadminCount <= 1) {
      throw ApiError.badRequest('Cannot change the role of the last superadmin');
    }
  }

  if (fullName) user.fullName = fullName.trim();
  if (email) user.email = email.trim().toLowerCase();
  if (role) user.role = role;
  if (password) user.passwordHash = await hashPassword(password);

  await user.save();
  return user.toJSON();
}

async function deleteUser(currentUser, id) {
  if (id === currentUser._id.toString()) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.role === 'superadmin') {
    const superadminCount = await User.countDocuments({ role: 'superadmin' });
    if (superadminCount <= 1) {
      throw ApiError.badRequest('Cannot delete the last superadmin');
    }
  }

  const assignedCount = await File.countDocuments({ createdBy: user._id });
  if (assignedCount > 0) {
    throw ApiError.conflict(
      `This user has ${assignedCount} file${assignedCount === 1 ? '' : 's'} assigned. Reassign ${
        assignedCount === 1 ? 'it' : 'them'
      } to another user before deleting.`,
      'HAS_ASSIGNED_FILES'
    );
  }

  await user.deleteOne();
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
