const authService = require('../services/auth.service');

async function login(req, res) {
  const result = await authService.login(req.body);
  return res.status(200).json(result);
}

async function me(req, res) {
  return res.status(200).json({ user: req.user.toJSON() });
}

module.exports = { login, me };
