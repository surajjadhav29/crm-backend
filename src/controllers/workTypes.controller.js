const workTypeService = require('../services/workType.service');

async function list(_req, res) {
  const workTypes = await workTypeService.listWorkTypes();
  return res.status(200).json({ workTypes });
}

async function create(req, res) {
  const workType = await workTypeService.createWorkType(req.user, req.body.name);
  return res.status(201).json({ workType });
}

module.exports = { list, create };
