const User = require('../models/User');
const { verifyToken } = require('../utils/jwt');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

module.exports = requireAuth;
