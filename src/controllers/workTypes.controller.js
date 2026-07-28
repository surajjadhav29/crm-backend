const workTypeService = require('../services/workType.service');

async function list(_req, res) {
  const workTypes = await workTypeService.listWorkTypes();
  return res.status(200).json({ workTypes });
}

async function getOne(req, res) {
  const workType = await workTypeService.getWorkType(req.params.id);
  return res.status(200).json({ workType });
}

async function create(req, res) {
  const workType = await workTypeService.createWorkType(req.user, {
    name: req.body.name,
    documents: req.body.documents,
  });
  return res.status(201).json({ workType });
}

async function update(req, res) {
  const workType = await workTypeService.updateWorkType(req.params.id, {
    name: req.body.name,
    documents: req.body.documents,
  });
  return res.status(200).json({ workType });
}

async function remove(req, res) {
  await workTypeService.deleteWorkType(req.params.id);
  return res.status(200).json({ success: true });
}

module.exports = { list, getOne, create, update, remove };
