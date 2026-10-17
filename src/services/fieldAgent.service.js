const FieldAgent = require('../models/FieldAgent');
const File = require('../models/File');
const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/objectId');
const { exactInsensitive } = require('../utils/regex');

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

function displayRto(agent) {
  if (!agent) return '';
  return String(agent.rtoName || agent.district || '').trim();
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

async function createFieldAgent(user, { name, mobile, rtoName } = {}) {
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

  const agent = await FieldAgent.create({
    name: normalizedName,
    mobile: normalizedMobile,
    rtoName: normalizedRto,
    district: '',
    isActive: true,
    createdBy: user._id,
  });
  return agent.toJSON();
}

async function updateFieldAgent(id, { name, mobile, rtoName, isActive } = {}) {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid field agent id');
  }

  const agent = await FieldAgent.findById(id);
  if (!agent) {
    throw ApiError.notFound('Field agent not found');
  }

  const previousName = agent.name;
  const previousMobile = agent.mobile;
  const previousRto = displayRto(agent);

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

  const currentRto = displayRto(agent);
  const changed =
    agent.name !== previousName ||
    agent.mobile !== previousMobile ||
    currentRto !== previousRto;
  if (changed) {
    await File.updateMany(
      { fieldAgentId: agent._id },
      {
        $set: {
          fieldAgentName: agent.name,
          fieldAgentMobile: agent.mobile,
          fieldAgentRtoName: agent.rtoName || currentRto,
          fieldAgentDistrict: '',
        },
      }
    );
  }

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
  normalizeLabel,
  normalizeMobile,
  normalizeRtoName,
};
