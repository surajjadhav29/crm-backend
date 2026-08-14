const mongoose = require('mongoose');

const expensesSchema = new mongoose.Schema(
  {
    challan: { type: Number, default: 0 },
    adjustment: { type: Number, default: 0 },
    puc: { type: Number, default: 0 },
    hsrp: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    roadTax: { type: Number, default: 0 },
    permitCancel: { type: Number, default: 0 },
    duplicatePermit: { type: Number, default: 0 },
    newPermit: { type: Number, default: 0 },
    pTax: { type: Number, default: 0 },
    urgent: { type: Number, default: 0 },
    cngAdjustment: { type: Number, default: 0 },
    mobNoUpdate: { type: Number, default: 0 },
    setDeal: { type: Number, default: 0 },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'objection', 'paper_return', 'on_hold', 'completed', 'done'],
      required: true,
    },
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' },
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
    // Uniqueness is (vehicleNo + workType) — same vehicle can have multiple work types.
    vehicleNo: { type: String, required: true, uppercase: true, trim: true },
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
    documents: { type: [String], default: [] },
    requiredDocuments: { type: [String], default: [] },
    totalBill: { type: Number, default: 0 },
    paymentDone: { type: Boolean, default: false },
    expenses: { type: expensesSchema, default: () => ({}) },
    statusHistory: { type: [statusHistorySchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.createdBy = ret.createdBy.toString();
        if (Array.isArray(ret.statusHistory)) {
          ret.statusHistory = ret.statusHistory.map((entry) => ({
            status: entry.status,
            at: entry.at instanceof Date ? entry.at.toISOString() : entry.at,
            note: entry.note || '',
          }));
        }
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

fileSchema.index({ createdBy: 1, createdAt: -1 });
fileSchema.index({ status: 1, date: 1 });
fileSchema.index({ createdBy: 1, status: 1 });
fileSchema.index({ dealerName: 1 });
fileSchema.index({ workType: 1 });
fileSchema.index({ rtoName: 1 });
// Same vehicle + same work type = duplicate; different work type is allowed.
fileSchema.index({ vehicleNo: 1, workType: 1 }, { unique: true });

module.exports = mongoose.model('File', fileSchema);
