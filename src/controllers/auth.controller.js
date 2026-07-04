const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getJwtSecret() {
    return process.env.JWT_SECRET || 'change-this-in-vercel-env';
}

function signToken(user) {
    return jwt.sign({ sub: user._id.toString(), role: user.role }, getJwtSecret(), {
        expiresIn: process.env.JWT_EXPIRES_IN || '28h',
    });
}

async function login(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const login = username.trim().toLowerCase();
    const user = await User.findOne({ $or: [{ username: login }, { email: login }] });
    if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = signToken(user);
    return res.status(200).json({ token, user: user.toJSON() });
}

async function me(req, res) {
    return res.status(200).json({ user: req.user.toJSON() });
}

module.exports = { login, me };