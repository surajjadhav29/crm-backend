const mongoose = require('mongoose');

/**
 * District field agent (RTO person) — tracking label only.
 * These people do not log into the CRM.
 */
const fieldAgentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, default: '', trim: true },
    rtoName: { type: String, default: '', trim: true, uppercase: true },
    /** @deprecated Legacy field — use rtoName. Kept for old records only. */
    district: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        if (ret.createdBy) ret.createdBy = ret.createdBy.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Same name allowed on different RTOs; not twice on the same RTO.
fieldAgentSchema.index({ name: 1, rtoName: 1 }, { unique: true });

module.exports = mongoose.model('FieldAgent', fieldAgentSchema);
