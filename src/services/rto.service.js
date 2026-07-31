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

/**
 * Ensure RTO is available for filters/dropdowns (Excel bulk).
 * Built-in MH* codes need no DB row. Custom names are created once.
 */
async function ensureRto(user, name) {
  if (!name || !String(name).trim()) {
    throw ApiError.badRequest('RTO name is required');
  }

  const key = rtoKey(name);
  if (!key) {
    throw ApiError.badRequest('RTO name is required');
  }

  // Built-in list already covers this code — nothing to insert.
  if (BASE_RTO_KEYS.has(key)) {
    return { name: cleanName(name), key, builtin: true };
  }

  const existing = await Rto.findOne({ key });
  if (existing) return existing.toJSON();

  try {
    return await createRto(user, name);
  } catch (err) {
    if (err.statusCode === 409) {
      const again = await Rto.findOne({ key });
      if (again) return again.toJSON();
      // Conflict because it matches a base key that appeared mid-flight.
      if (BASE_RTO_KEYS.has(key)) {
        return { name: cleanName(name), key, builtin: true };
      }
    }
    throw err;
  }
}

module.exports = { listRtos, createRto, ensureRto };
