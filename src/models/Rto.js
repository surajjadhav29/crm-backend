const mongoose = require('mongoose');

const rtoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, uppercase: true },
    // Space/case-insensitive identity key; the real duplicate guard.
    key: { type: String, required: true, unique: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('Rto', rtoSchema);
