const mongoose = require('mongoose');

const invoiceLineSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    vehicleNo: { type: String, default: '' },
    vehicleModel: { type: String, default: '' },
    workType: { type: String, default: '' },
    fileNumber: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const dealerSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zip: { type: String, default: '' },
    country: { type: String, default: 'India' },
  },
  { _id: false }
);

const dealerInvoiceSchema = new mongoose.Schema(
  {
    dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', required: true, index: true },
    billNumber: { type: String, required: true, unique: true, trim: true },
    invoiceSequence: { type: Number, min: 1, sparse: true, unique: true },
    generatedAt: { type: Date, required: true, default: Date.now },
    dealerSnapshot: { type: dealerSnapshotSchema, required: true },
    lines: { type: [invoiceLineSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    receivedAmount: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    filesMarkedPaid: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.dealerId = ret.dealerId.toString();
        ret.createdBy = ret.createdBy.toString();
        ret.lines = (ret.lines || []).map((line) => ({
          ...line,
          fileId: line.fileId ? String(line.fileId) : '',
        }));
        ret.balanceAmount = Math.max(0, (Number(ret.totalAmount) || 0) - (Number(ret.receivedAmount) || 0));
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

dealerInvoiceSchema.index({ generatedAt: -1 });
dealerInvoiceSchema.index({ dealerId: 1, generatedAt: -1 });

module.exports = mongoose.model('DealerInvoice', dealerInvoiceSchema);
