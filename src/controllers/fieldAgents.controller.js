const fieldAgentService = require('../services/fieldAgent.service');

async function list(req, res) {
  const activeOnly = String(req.query.activeOnly || '') === '1';
  const search = String(req.query.search || '').trim();
  const fieldAgents = await fieldAgentService.listFieldAgents({ activeOnly, search });
  return res.status(200).json({ fieldAgents });
}

async function getOne(req, res) {
  const fieldAgent = await fieldAgentService.getFieldAgent(req.params.id);
  return res.status(200).json({ fieldAgent });
}

async function create(req, res) {
  // Preferred: one RTO office with Agent 1 (+ optional Agent 2).
  if (req.body?.agent1 || req.body?.agents) {
    const agent1 = req.body.agent1 || req.body.agents?.[0];
    const agent2 = req.body.agent2 || req.body.agents?.[1];
    const result = await fieldAgentService.createRtoOffice(req.user, {
      rtoName: req.body.rtoName,
      address: req.body.address,
      agent1,
      agent2,
    });
    return res.status(201).json(result);
  }

  const fieldAgent = await fieldAgentService.createFieldAgent(req.user, {
    name: req.body.name,
    mobile: req.body.mobile,
    description: req.body.description,
    rtoName: req.body.rtoName,
    address: req.body.address,
  });
  return res.status(201).json({ fieldAgent });
}

async function updateOffice(req, res) {
  const result = await fieldAgentService.updateRtoOffice(req.user, {
    rtoName: req.body.rtoName,
    address: req.body.address,
    agent1: req.body.agent1,
    // Explicit null clears Agent 2; undefined means “leave as provided empty object handling”.
    agent2: req.body.agent2 === undefined ? undefined : req.body.agent2,
    agentIds: req.body.agentIds,
  });
  return res.status(200).json(result);
}

async function removeOffice(req, res) {
  const result = await fieldAgentService.deleteRtoOffice({
    rtoName: req.body?.rtoName || req.query.rtoName,
    agentIds: req.body?.agentIds,
  });
  return res.status(200).json(result);
}

async function update(req, res) {
  const fieldAgent = await fieldAgentService.updateFieldAgent(req.params.id, {
    name: req.body.name,
    mobile: req.body.mobile,
    description: req.body.description,
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

module.exports = { list, getOne, create, update, updateOffice, remove, removeOffice };
