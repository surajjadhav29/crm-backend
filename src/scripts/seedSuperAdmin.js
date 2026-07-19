const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const { hashPassword } = require('../utils/password');

async function run() {
  const fullName = process.env.SUPERADMIN_FULLNAME;
  const email = process.env.SUPERADMIN_EMAIL;
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!fullName || !email || !username || !password) {
    console.error(
      'Set SUPERADMIN_FULLNAME, SUPERADMIN_EMAIL, SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD before running this script.'
    );
    process.exit(1);
  }

  await connectDB();

  await User.deleteOne({ username: 'admin' });

  const existing = await User.findOne({ $or: [{ username }, { email: email.toLowerCase() }] });
  if (existing) {
    console.log(`User "${username}" already exists, skipping.`);
    await mongoose.disconnect();
    return;
  }

  await User.create({
    fullName,
    email: email.toLowerCase(),
    username: username.toLowerCase(),
    passwordHash: await hashPassword(password),
    role: 'superadmin',
    isActive: true,
  });

  console.log(`Super admin created: username="${username}"`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
