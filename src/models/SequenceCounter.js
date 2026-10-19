const mongoose = require('mongoose');

const sequenceCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 99 },
  },
  { timestamps: false }
);

module.exports = mongoose.model('SequenceCounter', sequenceCounterSchema);
