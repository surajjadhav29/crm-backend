const mongoose = require('mongoose');
const WorkType = require('../models/WorkType');
const File = require('../models/File');
const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/objectId');
const { exactInsensitive } = require('../utils/regex');
const {
  normalizeDocuments,
  normalizeWorkTypeName,
} = require('../constants/workType.constants');

async function findByNameInsensitive(name, excludeId) {
  const query = { name: exactInsensitive(name) };
  if (excludeId) query._id = { $ne: excludeId };
  return WorkType.findOne(query);
}

async function countFilesUsingWorkType(name) {
  return File.countDocuments({ workType: exactInsensitive(name) });
}

async function listWorkTypes() {
  const workTypes = await WorkType.find().sort({ name: 1 });
  return workTypes.map((w) => w.toJSON());
}

async function getWorkType(id) {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid work type id');
  }
  const workType = await WorkType.findById(id);
  if (!workType) {
    throw ApiError.notFound('Work type not found');
  }
  return workType.toJSON();
}

async function createWorkType(user, { name, documents } = {}) {
  const normalized = normalizeWorkTypeName(name);
  if (!normalized) {
    throw ApiError.badRequest('Work type name is required');
  }

  if (await findByNameInsensitive(normalized)) {
    throw ApiError.conflict('This work type already exists');
  }

  const workType = await WorkType.create({
    name: normalized,
    documents: normalizeDocuments(documents),
    createdBy: user._id,
  });
  return workType.toJSON();
}

/**
 * Persist rename + cascade file.workType updates atomically when Mongo
 * transactions are available; otherwise save then cascade with rollback.
 */
async function updateWorkType(id, { name, documents } = {}) {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid work type id');
  }

  const workType = await WorkType.findById(id);
  if (!workType) {
    throw ApiError.notFound('Work type not found');
  }

  const previousName = workType.name;

  if (name !== undefined) {
    const normalized = normalizeWorkTypeName(name);
    if (!normalized) {
      throw ApiError.badRequest('Work type name is required');
    }
    const clash = await findByNameInsensitive(normalized, workType._id);
    if (clash) {
      throw ApiError.conflict('This work type already exists');
    }
    workType.name = normalized;
  }

  if (documents !== undefined) {
    workType.documents = normalizeDocuments(documents);
  }

  const renamed = workType.name !== previousName;

  const applyCascade = async (session) => {
    const opts = session ? { session } : {};
    await workType.save(opts);
    if (renamed) {
      await File.updateMany(
        { workType: exactInsensitive(previousName) },
        { $set: { workType: workType.name } },
        opts
      );
    }
  };

  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    await applyCascade(session);
    await session.commitTransaction();
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        /* ignore */
      }
    }

    const txnUnsupported =
      err.code === 20 ||
      err.codeName === 'IllegalOperation' ||
      /replica set|transaction numbers/i.test(String(err.message || ''));

    if (txnUnsupported) {
      // Standalone Mongo (local dev): save + cascade with compensating rollback.
      await workType.save();
      if (renamed) {
        try {
          await File.updateMany(
            { workType: exactInsensitive(previousName) },
            { $set: { workType: workType.name } }
          );
        } catch (cascadeErr) {
          workType.name = previousName;
          await workType.save().catch(() => {});
          throw ApiError.badRequest(
            'Failed to update files after rename. Work type name was reverted.'
          );
        }
      }
    } else {
      throw err;
    }
  } finally {
    if (session) {
      session.endSession();
    }
  }

  return workType.toJSON();
}

async function deleteWorkType(id) {
  if (!isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid work type id');
  }
  const workType = await WorkType.findById(id);
  if (!workType) {
    throw ApiError.notFound('Work type not found');
  }

  const fileCount = await countFilesUsingWorkType(workType.name);
  if (fileCount > 0) {
    throw ApiError.conflict(
      `This work type is assigned to ${fileCount} file${fileCount === 1 ? '' : 's'}. Do not delete it.`
    );
  }

  await workType.deleteOne();
}

module.exports = {
  listWorkTypes,
  getWorkType,
  createWorkType,
  updateWorkType,
  deleteWorkType,
  normalizeWorkTypeName,
};
