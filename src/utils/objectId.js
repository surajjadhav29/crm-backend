const mongoose = require('mongoose');

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

module.exports = { isValidObjectId };
