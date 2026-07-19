const userService = require('../services/user.service');

async function list(_req, res) {
  const users = await userService.listUsers();
  return res.status(200).json({ users });
}

async function create(req, res) {
  const user = await userService.createUser(req.body);
  return res.status(201).json({ user });
}

async function update(req, res) {
  const user = await userService.updateUser(req.params.id, req.body);
  return res.status(200).json({ user });
}

async function remove(req, res) {
  await userService.deleteUser(req.user, req.params.id);
  return res.status(200).json({ success: true });
}

module.exports = { list, create, update, remove };
