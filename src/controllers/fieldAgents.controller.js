const fieldAgentService = require('../services/fieldAgent.service');

async function list(req, res) {
  const activeOnly = String(req.query.activeOnly || '') === '1';
  const fieldAgents = await fieldAgentService.listFieldAgents({ activeOnly });
  return res.status(200).json({ fieldAgents });
}

async function getOne(req, res) {
  const fieldAgent = await fieldAgentService.getFieldAgent(req.params.id);
  return res.status(200).json({ fieldAgent });
}

async function create(req, res) {
  const fieldAgent = await fieldAgentService.createFieldAgent(req.user, {
    name: req.body.name,
    mobile: req.body.mobile,
    rtoName: req.body.rtoName,
    address: req.body.address,
  });
  return res.status(201).json({ fieldAgent });
}

async function update(req, res) {
  const fieldAgent = await fieldAgentService.updateFieldAgent(req.params.id, {
    name: req.body.name,
    mobile: req.body.mobile,
    rtoName: req.body.rtoName,
    address: req.body.address,
    isActive: req.body.isActive,
  });
  return res.status(200).json({ fieldAgent });
}

async function remove(req, res) {
  await fieldAgentService.deleteFieldAgent(req.params.id);
  return res.status(200).json({ success: true });
}

module.exports = { list, getOne, create, update, remove };
