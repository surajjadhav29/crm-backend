const bcrypt = require('bcryptjs');
const User = require('../models/User');

const ROLES = ['superadmin', 'staff'];

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

async function list(_req, res) {
  const users = await User.find().sort({ createdAt: -1 });
  return res.status(200).json({ users: users.map((u) => u.toJSON()) });
}

async function create(req, res) {
  const { fullName, email, role, password } = req.body;

  if (!fullName || !email || !role || !password) {
    return res.status(400).json({ error: 'fullName, email, role and password are required' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const username = await generateUsername(normalizedEmail);
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    username,
    passwordHash,
    role,
    isActive: true,
  });

  return res.status(201).json({ user: user.toJSON() });
}

async function update(req, res) {
  const { id } = req.params;
  const { fullName, email, role, password } = req.body;

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (password && password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (fullName) user.fullName = fullName.trim();
  if (email) user.email = email.trim().toLowerCase();
  if (role) user.role = role;
  if (password) user.passwordHash = await bcrypt.hash(password, 10);

  await user.save();
  return res.status(200).json({ user: user.toJSON() });
}

module.exports = { list, create, update };
