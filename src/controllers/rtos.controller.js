const rtoService = require('../services/rto.service');

async function list(_req, res) {
  const rtos = await rtoService.listRtos();
  return res.status(200).json({ rtos });
}

async function create(req, res) {
  const rto = await rtoService.createRto(req.user, req.body.name);
  return res.status(201).json({ rto });
}

module.exports = { list, create };
