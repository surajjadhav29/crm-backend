const mongoose = require('mongoose');
const { resolveLastStatusAt } = require('../utils/fileStatus');

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

const paperLocationHistorySchema = new mongoose.Schema(
  {
    location: {
      type: String,
      enum: ['paper_in_office', 'paper_with_field_agent'],
      required: true,
    },
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const objectionReviewSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true, trim: true },
    at: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
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
    dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', default: null },
    workType: { type: String, required: true },
    paperLocation: {
      type: String,
      enum: ['paper_in_office', 'paper_with_field_agent'],
      default: 'paper_in_office',
    },
    paperLocationHistory: { type: [paperLocationHistorySchema], default: [] },
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
    /** Staff/admin follow-up notes while file stays in Objection (reminder snooze). */
    objectionReviews: { type: [objectionReviewSchema], default: [] },
    /** Denormalized from latest statusHistory.at — for fast list sort only. */
    lastStatusAt: { type: Date, default: null },
    /**
     * District field agent (RTO person) — tracking only; they do not log in.
     * Name/district are denormalized for fast list display.
     */
    fieldAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldAgent', default: null },
    fieldAgentName: { type: String, default: '' },
    fieldAgentMobile: { type: String, default: '' },
    fieldAgentRtoName: { type: String, default: '' },
    /** @deprecated Use fieldAgentRtoName — kept for legacy rows. */
    fieldAgentDistrict: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.createdBy = ret.createdBy.toString();
        if (ret.fieldAgentId) {
          ret.fieldAgentId = ret.fieldAgentId.toString();
        } else {
          ret.fieldAgentId = null;
        }
        if (ret.dealerId) ret.dealerId = ret.dealerId.toString();
        if (ret.lastStatusAt instanceof Date) {
          ret.lastStatusAt = ret.lastStatusAt.toISOString();
        }
        if (Array.isArray(ret.statusHistory)) {
          ret.statusHistory = ret.statusHistory.map((entry) => ({
            status: entry.status,
            at: entry.at instanceof Date ? entry.at.toISOString() : entry.at,
            note: entry.note || '',
          }));
        }
        if (!ret.paperLocation) {
          ret.paperLocation = 'paper_in_office';
        }
        if (Array.isArray(ret.paperLocationHistory)) {
          ret.paperLocationHistory = ret.paperLocationHistory.map((entry) => ({
            location: entry.location,
            at: entry.at instanceof Date ? entry.at.toISOString() : entry.at,
            note: entry.note || '',
          }));
        } else {
          ret.paperLocationHistory = [];
        }
        if (Array.isArray(ret.objectionReviews)) {
          ret.objectionReviews = ret.objectionReviews.map((entry) => ({
            reason: entry.reason || '',
            at: entry.at instanceof Date ? entry.at.toISOString() : entry.at,
            userId: entry.userId ? entry.userId.toString() : '',
            userName: entry.userName || '',
          }));
        } else {
          ret.objectionReviews = [];
        }
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

fileSchema.index({ createdBy: 1, createdAt: -1 });
fileSchema.index({ createdBy: 1, lastStatusAt: -1 });
fileSchema.index({ createdBy: 1, status: 1, lastStatusAt: -1 });
fileSchema.index({ status: 1, lastStatusAt: -1, createdAt: -1 });
fileSchema.index({ status: 1, date: 1 });
fileSchema.index({ createdBy: 1, status: 1 });
fileSchema.index({ fieldAgentId: 1 });
fileSchema.index({ dealerName: 1 });
fileSchema.index({ dealerId: 1 });
fileSchema.index({ workType: 1 });
fileSchema.index({ rtoName: 1 });
// Same vehicle + same work type = duplicate; different work type is allowed.
fileSchema.index({ vehicleNo: 1, workType: 1 }, { unique: true });

// Keep lastStatusAt in sync whenever statusHistory changes (history = source of truth).
fileSchema.pre('save', function syncLastStatusAtFromHistory(next) {
  if (this.isModified('statusHistory')) {
    const resolved = resolveLastStatusAt({
      statusHistory: this.statusHistory,
      createdAt: this.createdAt,
    });
    if (resolved) this.lastStatusAt = resolved;
  }
  next();
});

module.exports = mongoose.model('File', fileSchema);
