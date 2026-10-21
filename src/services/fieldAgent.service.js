const FieldAgent = require('../models/FieldAgent');
const File = require('../models/File');
const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/objectId');
const { exactInsensitive } = require('../utils/regex');
const { rtoMatchKey, fieldAgentRtoLabel: agentRtoLabel } = require('../utils/rtoMatch');

const MOBILE_RE = /^\d{10}$/;

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

function normalizeAddress(value) {
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

async function findAgentOccupyingRto(rtoName, { excludeId } = {}) {
  const targetKey = rtoMatchKey(rtoName);
  if (!targetKey) return null;
  const query = excludeId ? { _id: { $ne: excludeId } } : {};
  const agents = await FieldAgent.find(query);
  return agents.find((a) => rtoMatchKey(displayRto(a)) === targetKey) || null;
}

/** Active field agent for an RTO code (first name A→Z). At most one per RTO in registry. */
async function pickActiveFieldAgentForRto(rtoName) {
  const targetKey = rtoMatchKey(rtoName);
  if (!targetKey) return null;
  const agents = await FieldAgent.find({ isActive: true }).sort({ name: 1, rtoName: 1 });
  return agents.find((a) => rtoMatchKey(displayRto(a)) === targetKey) || null;
}

async function findDuplicate({ name, rtoName, excludeId }) {
  const query = {
    name: exactInsensitive(name),
    rtoName: exactInsensitive(rtoName),
  };
  if (excludeId) query._id = { $ne: excludeId };
  return FieldAgent.findOne(query);
}

async function listFieldAgents({ activeOnly = false } = {}) {
  const query = activeOnly ? { isActive: true } : {};
  const agents = await FieldAgent.find(query).sort({ rtoName: 1, name: 1 });
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

async function createFieldAgent(user, { name, mobile, rtoName, address } = {}) {
  const normalizedName = normalizeLabel(name);
  const normalizedMobile = normalizeMobile(mobile);
  const normalizedRto = normalizeRtoName(rtoName);
  if (!normalizedName) {
    throw ApiError.badRequest('Agent name is required');
  }
  if (!MOBILE_RE.test(normalizedMobile)) {
    throw ApiError.badRequest('Mobile must be a 10 digit number');
  }
  if (!normalizedRto) {
    throw ApiError.badRequest('RTO is required');
  }

  if (await findDuplicate({ name: normalizedName, rtoName: normalizedRto })) {
    throw ApiError.conflict('This agent already exists for that RTO');
  }

  const rtoTaken = await findAgentOccupyingRto(normalizedRto);
  if (rtoTaken) {
    throw ApiError.conflict(
      `This RTO already has a field agent (${rtoTaken.name}). Edit or remove them first.`,
      'FIELD_AGENT_RTO_TAKEN'
    );
  }

  const agent = await FieldAgent.create({
    name: normalizedName,
    mobile: normalizedMobile,
    rtoName: normalizedRto,
    address: normalizeAddress(address),
    district: '',
    isActive: true,
    createdBy: user._id,
  });
  return agent.toJSON();
}

async function updateFieldAgent(id, { name, mobile, rtoName, address, isActive } = {}) {
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
    if (!MOBILE_RE.test(normalizedMobile)) {
      throw ApiError.badRequest('Mobile must be a 10 digit number');
    }
    agent.mobile = normalizedMobile;
  }
  if (rtoName !== undefined) {
    const normalizedRto = normalizeRtoName(rtoName);
    if (!normalizedRto) {
      throw ApiError.badRequest('RTO is required');
    }
    agent.rtoName = normalizedRto;
    agent.district = '';
  }
  if (address !== undefined) {
    agent.address = normalizeAddress(address);
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

  const rtoTaken = await findAgentOccupyingRto(rtoForUnique, { excludeId: agent._id });
  if (rtoTaken) {
    throw ApiError.conflict(
      `This RTO already has a field agent (${rtoTaken.name}). Edit or remove them first.`,
      'FIELD_AGENT_RTO_TAKEN'
    );
  }

  await agent.save();

  // Do not rewrite fieldAgentName/mobile on existing files — each file keeps the
  // label snapshot from when it was created or last RTO-mapped. New files pick up
  // the current registry name via file.service resolveFieldAgentOnFile.

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

  await File.updateMany(
    { fieldAgentId: agent._id },
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

  await agent.deleteOne();
  return { success: true };
}

module.exports = {
  listFieldAgents,
  getFieldAgent,
  createFieldAgent,
  updateFieldAgent,
  deleteFieldAgent,
  pickActiveFieldAgentForRto,
  findAgentOccupyingRto,
  normalizeLabel,
  normalizeMobile,
  normalizeRtoName,
  rtoMatchKey,
};
