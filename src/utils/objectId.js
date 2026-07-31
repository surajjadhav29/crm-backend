const mongoose = require('mongoose');

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

/** Cast string ids for aggregate $match (find() casts; aggregate does not). */
function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!isValidObjectId(String(value))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

module.exports = { isValidObjectId, toObjectId };