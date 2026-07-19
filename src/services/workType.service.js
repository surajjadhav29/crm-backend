const WorkType = require('../models/WorkType');
const ApiError = require('../utils/apiError');

async function listWorkTypes() {
  const workTypes = await WorkType.find().sort({ name: 1 });
  return workTypes.map((w) => w.toJSON());
}

async function createWorkType(user, name) {
  if (!name || !name.trim()) {
    throw ApiError.badRequest('Work type name is required');
  }

  const normalized = name.trim().toUpperCase();
  if (await WorkType.findOne({ name: normalized })) {
    throw ApiError.conflict('This work type already exists');
  }

  const workType = await WorkType.create({ name: normalized, createdBy: user._id });
  return workType.toJSON();
}

module.exports = { listWorkTypes, createWorkType };
