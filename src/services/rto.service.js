const Rto = require('../models/Rto');
const ApiError = require('../utils/apiError');
const { BASE_RTO_KEYS, rtoKey } = require('../constants/rto.constants');

async function listRtos() {
  const rtos = await Rto.find().sort({ name: 1 });
  return rtos.map((r) => r.toJSON());
}

// Collapse internal runs of whitespace and uppercase for a clean display name.
function cleanName(name) {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

async function createRto(user, name) {
  if (!name || !name.trim()) {
    throw ApiError.badRequest('RTO name is required');
  }

  const key = rtoKey(name);
  const displayName = cleanName(name);

  // A custom RTO must never duplicate a built-in one or an existing DB entry,
  // regardless of spacing (e.g. "MH22-PARBHANI" vs "MH22 - PARBHANI").
  if (BASE_RTO_KEYS.has(key) || (await Rto.findOne({ key }))) {
    throw ApiError.conflict('This RTO already exists');
  }

  const rto = await Rto.create({ name: displayName, key, createdBy: user._id });
  return rto.toJSON();
}

module.exports = { listRtos, createRto };
