const mongoose = require('mongoose');

const expensesSchema = new mongoose.Schema(
  {
    challan: { type: Number, default: 0 },
    adjustment: { type: Number, default: 0 },
    puc: { type: Number, default: 0 },
    hsrp: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    setDeal: { type: Number, default: 0 },
  },
  { _id: false }
);

const fileSchema = new mongoose.Schema(
  {
    fileNumber: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'objection', 'paper_return', 'on_hold', 'completed', 'done'],
      default: 'pending',
    },
    dealerName: { type: String, required: true },
    workType: { type: String, required: true },
    vehicleNo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    vehicleModel: { type: String, required: true },
    chassisNo: { type: String, required: true },
    engineNo: { type: String, required: true },
    oldOwnerName: { type: String, required: true },
    ownerName: { type: String, default: '' },
    oldOwnerMob: { type: String, required: true },
    newOwnerMob: { type: String, default: '' },
    dealerMob: { type: String, default: '' },
    rtoName: { type: String, required: true },
    remarks: { type: String, default: '' },
    totalBill: { type: Number, default: 0 },
    paymentDone: { type: Boolean, default: false },
    expenses: { type: expensesSchema, default: () => ({}) },
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
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('File', fileSchema);
