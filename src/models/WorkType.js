const mongoose = require('mongoose');

const workTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, uppercase: true, unique: true },
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

module.exports = mongoose.model('WorkType', workTypeSchema);
