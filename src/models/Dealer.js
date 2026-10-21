const mongoose = require('mongoose');
const { dealerNameKey } = require('../utils/dealerNameKey');

const dealerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Uppercase, collapsed spaces — unique registry name. */
    nameKey: { type: String, required: true, trim: true, unique: true },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      default: undefined,
    },
    phone: { type: String, required: true, trim: true, unique: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zip: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.createdBy = ret.createdBy.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.nameKey;
        return ret;
      },
    },
  }
);

dealerSchema.pre('validate', function setNameKeyAndNormalizeEmail() {
  if (this.name) {
    this.nameKey = dealerNameKey(this.name);
  }
  if (!this.email || !String(this.email).trim()) {
    this.email = undefined;
  }
});

module.exports = mongoose.model('Dealer', dealerSchema);
