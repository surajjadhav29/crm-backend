const FieldAgent = require('../models/FieldAgent');
const File = require('../models/File');
const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/objectId');
const { escapeRegex, exactInsensitive } = require('../utils/regex');
const { rtoMatchKey, fieldAgentRtoLabel: agentRtoLabel } = require('../utils/rtoMatch');

const MOBILE_RE = /^\d{10}$/;
const MAX_AGENTS_PER_RTO = 2;

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeRtoName(value) {
  return normalizeLabel(value).toUpperCase();
}

function normalizeMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.slice(-10);
}

function normalizeDescription(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function displayRto(agent) {
  return agentRtoLabel(agent);
}

function buildSearchQuery(search) {
  const q = String(search || '').trim();
  if (!q) return null;
  const re = new RegExp(escapeRegex(q), 'i');
  return {
    $or: [
      { name: re },
      { rtoName: re },
      { district: re },
      { mobile: re },
      { description: re },
    ],
  };
}

/** All agents whose RTO code matches (e.g. MH12), optionally excluding one id. */
async function listAgentsForRto(rtoName, { excludeId, activeOnly = false } = {}) {
  const targetKey = rtoMatchKey(rtoName);
  if (!targetKey) return [];
  const query = {};
  if (excludeId) query._id = { $ne: excludeId };
  if (activeOnly) query.isActive = true;
  const agents = await FieldAgent.find(query).sort({ name: 1, createdAt: 1, rtoName: 1 });
  return agents.filter((a) => rtoMatchKey(displayRto(a)) === targetKey);
}

async function countAgentsForRto(rtoName, { excludeId } = {}) {
  const list = await listAgentsForRto(rtoName, { excludeId });
  return list.length;
}

async function findAgentOccupyingRto(rtoName, { excludeId } = {}) {
  const list = await listAgentsForRto(rtoName, { excludeId });
  return list[0] || null;
}

/** Active field agent for an RTO (first by createdAt when several). */
async function pickActiveFieldAgentForRto(rtoName) {
  const list = await listAgentsForRto(rtoName, { activeOnly: true });
  return list[0] || null;
}

async function findDuplicate({ name, rtoName, excludeId }) {
  const query = {
    name: exactInsensitive(name),
    rtoName: exactInsensitive(rtoName),
  };
  if (excludeId) query._id = { $ne: excludeId };
  return FieldAgent.findOne(query);
}

/**
 * List agents. Optional `search` matches agent name, mobile, or RTO.
 * Flat list kept for file-form dropdown; admin UI groups by RTO.
 */
async function listFieldAgents({ activeOnly = false, search = '' } = {}) {
  const parts = [];
  if (activeOnly) parts.push({ isActive: true });
  const searchQuery = buildSearchQuery(search);
  if (searchQuery) parts.push(searchQuery);

  const query = parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { $and: parts };
  const agents = await FieldAgent.find(query).sort({ rtoName: 1, createdAt: 1, name: 1 });
  return agents.map((a) => a.toJSON());
}

async function getFieldAgent(id) {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid field agent id');
  }
  const agent = await FieldAgent.findById(id);
  if (!agent) {
    throw ApiError.notFound('Field agent not found');
  }
  return agent.toJSON();
}

function parseAgentSlot(slot, { required, label }) {
  const name = normalizeLabel(slot?.name);
  const mobile = normalizeMobile(slot?.mobile);
  const description = normalizeDescription(slot?.description);
  if (!name && !mobile && !description) {
    if (required) {
      throw ApiError.badRequest(`${label} name is required`);
    }
    return null;
  }
  if (!name) {
    throw ApiError.badRequest(`${label} name is required`);
  }
  // Mobile is optional; if provided it must be a valid 10-digit number.
  if (mobile && !MOBILE_RE.test(mobile)) {
    throw ApiError.badRequest(`${label} mobile must be a 10 digit number`);
  }
  return { name, mobile, description };
}

/**
 * Create one RTO office entry: Agent 1 required, Agent 2 optional.
 * Stored as 1–2 agent docs sharing the same RTO (file assignment keeps agent ids).
 */
async function createRtoOffice(user, { rtoName, agent1, agent2 } = {}) {
  const normalizedRto = normalizeRtoName(rtoName);
  if (!normalizedRto) {
    throw ApiError.badRequest('RTO is required');
  }

  const existingCount = await countAgentsForRto(normalizedRto);
  if (existingCount > 0) {
    throw ApiError.conflict(
      'This RTO already has a field-agent entry. Edit that entry instead.',
      'FIELD_AGENT_RTO_EXISTS'
    );
  }

  const first = parseAgentSlot(agent1, { required: true, label: 'Field Agent 1' });
  const second = parseAgentSlot(agent2, { required: false, label: 'Field Agent 2' });
  if (second && first.name.toLowerCase() === second.name.toLowerCase()) {
    throw ApiError.badRequest('Field Agent 1 and Field Agent 2 must have different names');
  }

  const created = [];

  const a1 = await FieldAgent.create({
    name: first.name,
    mobile: first.mobile,
    description: first.description,
    rtoName: normalizedRto,
    address: '',
    district: '',
    isActive: true,
    createdBy: user._id,
  });
  created.push(a1);

  if (second) {
    const a2 = await FieldAgent.create({
      name: second.name,
      mobile: second.mobile,
      description: second.description,
      rtoName: normalizedRto,
      address: '',
      district: '',
      isActive: true,
      createdBy: user._id,
    });
    created.push(a2);
  }

  return {
    office: {
      id: a1._id.toString(),
      rtoName: normalizedRto,
      agents: created.map((a) => a.toJSON()),
    },
  };
}

/**
 * Update an RTO office (edit Agent 1 / optional Agent 2 on the same entry).
 * `agentIds` = existing agent doc ids for this office (1 or 2).
 */
async function updateRtoOffice(
  user,
  { rtoName, agent1, agent2, agentIds = [] } = {}
) {
  const normalizedRto = normalizeRtoName(rtoName);
  if (!normalizedRto) {
    throw ApiError.badRequest('RTO is required');
  }

  const ids = (Array.isArray(agentIds) ? agentIds : []).filter((id) => isValidObjectId(id));
  if (!ids.length) {
    throw ApiError.badRequest('Existing field agent ids are required to update');
  }

  const existing = await FieldAgent.find({ _id: { $in: ids } }).sort({ createdAt: 1 });
  if (!existing.length) {
    throw ApiError.notFound('Field agent entry not found');
  }

  const first = parseAgentSlot(agent1, { required: true, label: 'Field Agent 1' });
  const second = parseAgentSlot(agent2, { required: false, label: 'Field Agent 2' });
  if (second && first.name.toLowerCase() === second.name.toLowerCase()) {
    throw ApiError.badRequest('Field Agent 1 and Field Agent 2 must have different names');
  }

  // RTO change: target must not already have another office's agents.
  const otherOnTarget = (await listAgentsForRto(normalizedRto)).filter(
    (a) => !ids.includes(a._id.toString())
  );
  if (otherOnTarget.length) {
    throw ApiError.conflict(
      'This RTO already has another field-agent entry. Choose a different RTO.',
      'FIELD_AGENT_RTO_EXISTS'
    );
  }

  const sorted = [...existing].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a.name).localeCompare(b.name)
  );

  const primary = sorted[0];
  primary.name = first.name;
  primary.mobile = first.mobile;
  primary.description = first.description;
  primary.rtoName = normalizedRto;
  primary.address = '';
  primary.district = '';
  await primary.save();

  const resultAgents = [primary];

  if (second) {
    if (sorted[1]) {
      const secondary = sorted[1];
      secondary.name = second.name;
      secondary.mobile = second.mobile;
      secondary.description = second.description;
      secondary.rtoName = normalizedRto;
      secondary.address = '';
      secondary.district = '';
      await secondary.save();
      resultAgents.push(secondary);
    } else {
      const created = await FieldAgent.create({
        name: second.name,
        mobile: second.mobile,
        description: second.description,
        rtoName: normalizedRto,
        address: '',
        district: '',
        isActive: true,
        createdBy: user._id,
      });
      resultAgents.push(created);
    }
  } else if (sorted[1]) {
    // Agent 2 cleared — remove second doc and unlink files.
    await clearFilesForAgent(sorted[1]._id);
    await sorted[1].deleteOne();
  }

  // Drop any extra agents beyond 2 that belonged to this office edit set.
  for (const extra of sorted.slice(2)) {
    await clearFilesForAgent(extra._id);
    await extra.deleteOne();
  }

  return {
    office: {
      id: primary._id.toString(),
      rtoName: normalizedRto,
      agents: resultAgents.map((a) => a.toJSON()),
    },
  };
}

async function clearFilesForAgent(agentId) {
  await File.updateMany(
    { fieldAgentId: agentId },
    {
      $set: {
        fieldAgentId: null,
        fieldAgentName: '',
        fieldAgentMobile: '',
        fieldAgentRtoName: '',
        fieldAgentDistrict: '',
      },
    }
  );
}

/** Delete the whole RTO office (all agent docs for that RTO code). */
async function deleteRtoOffice({ rtoName, agentIds = [] } = {}) {
  let agents = [];
  if (Array.isArray(agentIds) && agentIds.length) {
    const ids = agentIds.filter((id) => isValidObjectId(id));
    agents = await FieldAgent.find({ _id: { $in: ids } });
  } else if (rtoName) {
    agents = await listAgentsForRto(rtoName);
  }
  if (!agents.length) {
    throw ApiError.notFound('Field agent entry not found');
  }

  for (const agent of agents) {
    await clearFilesForAgent(agent._id);
    await agent.deleteOne();
  }
  return { success: true, deleted: agents.length };
}

/** Legacy single-agent create (kept for compatibility). Prefer createRtoOffice. */
async function createFieldAgent(user, { name, mobile, description, rtoName } = {}) {
  return createRtoOffice(user, {
    rtoName,
    agent1: { name, mobile, description },
  }).then((result) => result.office.agents[0]);
}

async function updateFieldAgent(id, { name, mobile, description, rtoName, isActive } = {}) {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid field agent id');
  }

  const agent = await FieldAgent.findById(id);
  if (!agent) {
    throw ApiError.notFound('Field agent not found');
  }

  if (name !== undefined) {
    const normalizedName = normalizeLabel(name);
    if (!normalizedName) {
      throw ApiError.badRequest('Agent name is required');
    }
    agent.name = normalizedName;
  }
  if (mobile !== undefined) {
    const normalizedMobile = normalizeMobile(mobile);
    if (normalizedMobile && !MOBILE_RE.test(normalizedMobile)) {
      throw ApiError.badRequest('Mobile must be a 10 digit number');
    }
    agent.mobile = normalizedMobile;
  }
  if (description !== undefined) {
    agent.description = normalizeDescription(description);
  }
  if (rtoName !== undefined) {
    const normalizedRto = normalizeRtoName(rtoName);
    if (!normalizedRto) {
      throw ApiError.badRequest('RTO is required');
    }
    agent.rtoName = normalizedRto;
    agent.district = '';
  }
  if (isActive !== undefined) {
    agent.isActive = Boolean(isActive);
  }

  const rtoForUnique = agent.rtoName || displayRto(agent);
  const clash = await findDuplicate({
    name: agent.name,
    rtoName: rtoForUnique,
    excludeId: agent._id,
  });
  if (clash) {
    throw ApiError.conflict('This agent already exists for that RTO');
  }

  await agent.save();
  return agent.toJSON();
}

async function deleteFieldAgent(id) {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid field agent id');
  }

  const agent = await FieldAgent.findById(id);
  if (!agent) {
    throw ApiError.notFound('Field agent not found');
  }

  // Delete the whole office for this RTO so the table stays one row per RTO.
  return deleteRtoOffice({ rtoName: agent.rtoName || agent.district });
}

module.exports = {
  MAX_AGENTS_PER_RTO,
  listFieldAgents,
  getFieldAgent,
  createFieldAgent,
  updateFieldAgent,
  deleteFieldAgent,
  createRtoOffice,
  updateRtoOffice,
  deleteRtoOffice,
  pickActiveFieldAgentForRto,
  listAgentsForRto,
  countAgentsForRto,
  findAgentOccupyingRto,
  normalizeLabel,
  normalizeMobile,
  normalizeRtoName,
  rtoMatchKey,
};
