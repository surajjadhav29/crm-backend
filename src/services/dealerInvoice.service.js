const Dealer = require('../models/Dealer');
const DealerInvoice = require('../models/DealerInvoice');
const SequenceCounter = require('../models/SequenceCounter');
const File = require('../models/File');
const ApiError = require('../utils/apiError');
const { isValidObjectId, toObjectId } = require('../utils/objectId');
const { markDealerFilesInvoiced } = require('./dealerInvoiceFiles.service');

const INVOICE_SEQ_COUNTER_KEY = 'dealerInvoice';
/** First reserved sequence is 100 (counter starts at 99, then $inc). */
const INVOICE_SEQ_FLOOR = 99;

function trim(value) {
  return String(value || '').trim();
}

function parseLegacyBillNumberSequence(billNumber) {
  const s = trim(billNumber);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const tail = s.split('-').pop();
  if (tail && /^\d+$/.test(tail)) return parseInt(tail, 10);
  return 0;
}

async function ensureInvoiceSequenceCounter() {
  const existing = await SequenceCounter.findOne({ key: INVOICE_SEQ_COUNTER_KEY });
  if (existing) return existing;

  const rows = await DealerInvoice.find({}, { invoiceSequence: 1 }).lean();
  let maxSeq = INVOICE_SEQ_FLOOR;
  for (const row of rows) {
    if (Number.isFinite(row.invoiceSequence) && row.invoiceSequence > 0) {
      maxSeq = Math.max(maxSeq, row.invoiceSequence);
    }
  }

  try {
    return await SequenceCounter.create({ key: INVOICE_SEQ_COUNTER_KEY, seq: maxSeq });
  } catch (err) {
    if (err?.code === 11000) {
      return SequenceCounter.findOne({ key: INVOICE_SEQ_COUNTER_KEY });
    }
    throw err;
  }
}

async function peekNextBillNumber(user) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can view billing invoices');
  }
  await ensureInvoiceSequenceCounter();
  const counter = await SequenceCounter.findOne({ key: INVOICE_SEQ_COUNTER_KEY });
  const next = (counter?.seq ?? INVOICE_SEQ_FLOOR) + 1;
  return String(next);
}

async function reserveNextBillNumber() {
  await ensureInvoiceSequenceCounter();
  const updated = await SequenceCounter.findOneAndUpdate(
    { key: INVOICE_SEQ_COUNTER_KEY },
    { $inc: { seq: 1 } },
    { new: true }
  );
  if (!updated) {
    throw ApiError.badRequest('Could not allocate invoice number');
  }
  return { billNumber: String(updated.seq), invoiceSequence: updated.seq };
}

function parseMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function dealerSnapshotFrom(dealer) {
  return {
    name: dealer.name,
    email: dealer.email || '',
    phone: dealer.phone || '',
    address: dealer.address || '',
    city: dealer.city || '',
    state: dealer.state || '',
    zip: dealer.zip || '',
    country: dealer.country || 'India',
  };
}

function normalizeLines(rawLines) {
  if (!Array.isArray(rawLines) || !rawLines.length) {
    throw ApiError.badRequest('lines is required');
  }
  return rawLines.map((line) => {
    const fileId = trim(line.fileId);
    if (!isValidObjectId(fileId)) {
      throw ApiError.badRequest('Invalid file id in lines');
    }
    const amount = parseMoney(line.amount);
    if (amount <= 0) {
      throw ApiError.badRequest('Each invoice line must have amount greater than zero');
    }
    return {
      fileId: toObjectId(fileId),
      vehicleNo: trim(line.vehicleNo),
      vehicleModel: trim(line.vehicleModel),
      workType: trim(line.workType),
      fileNumber: trim(line.fileNumber),
      amount,
    };
  });
}

async function assertLinesBelongToDealer(dealerId, lines) {
  const ids = lines.map((l) => l.fileId);
  const files = await File.find({
    _id: { $in: ids },
    dealerId,
    paymentDone: { $ne: true },
    status: { $ne: 'paper_return' },
  });
  if (files.length !== lines.length) {
    throw ApiError.badRequest(
      'One or more files are invalid, already paid, excluded, or belong to another dealer'
    );
  }
}

async function maybeMarkFilesPaid(user, dealerId, invoice) {
  const total = parseMoney(invoice.totalAmount);
  const received = parseMoney(invoice.receivedAmount);
  if (received < total || invoice.filesMarkedPaid) return invoice;

  const fileIds = invoice.lines.map((l) => String(l.fileId));
  await markDealerFilesInvoiced(user, String(dealerId), fileIds);
  invoice.filesMarkedPaid = true;
  await invoice.save();
  return invoice;
}

async function listInvoices(user, { dealerId, limit = 50 } = {}) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can view billing invoices');
  }
  const query = {};
  if (dealerId) {
    if (!isValidObjectId(dealerId)) throw ApiError.badRequest('Invalid dealer id');
    query.dealerId = toObjectId(dealerId);
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await DealerInvoice.find(query).sort({ generatedAt: -1 }).limit(safeLimit);
  return rows.map((row) => row.toJSON());
}

async function getInvoice(user, dealerId, invoiceId) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can view billing invoices');
  }
  if (!isValidObjectId(dealerId) || !isValidObjectId(invoiceId)) {
    throw ApiError.badRequest('Invalid id');
  }
  const invoice = await DealerInvoice.findOne({
    _id: invoiceId,
    dealerId: toObjectId(dealerId),
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice.toJSON();
}

async function createInvoice(user, dealerId, body = {}) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can create billing invoices');
  }
  if (!isValidObjectId(dealerId)) {
    throw ApiError.badRequest('Invalid dealer id');
  }

  const dealer = await Dealer.findById(dealerId);
  if (!dealer) throw ApiError.notFound('Dealer not found');

  let billNumber = trim(body.billNumber);
  let invoiceSequence;
  if (billNumber) {
    const existing = await DealerInvoice.findOne({ billNumber });
    if (existing) throw ApiError.conflict('An invoice with this number already exists');
    const parsed = parseLegacyBillNumberSequence(billNumber);
    if (/^\d+$/.test(billNumber) && parsed >= 100) {
      invoiceSequence = parsed;
    }
  } else {
    const allocated = await reserveNextBillNumber();
    billNumber = allocated.billNumber;
    invoiceSequence = allocated.invoiceSequence;
  }

  const lines = normalizeLines(body.lines);
  await assertLinesBelongToDealer(dealer._id, lines);

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  const receivedAmount = parseMoney(body.receivedAmount);
  if (receivedAmount > totalAmount) {
    throw ApiError.badRequest('receivedAmount cannot exceed invoice total');
  }

  const invoice = await DealerInvoice.create({
    dealerId: dealer._id,
    billNumber,
    invoiceSequence,
    generatedAt: body.generatedAt ? new Date(body.generatedAt) : new Date(),
    dealerSnapshot: dealerSnapshotFrom(dealer),
    lines,
    totalAmount,
    receivedAmount,
    createdBy: user._id,
  });

  await maybeMarkFilesPaid(user, dealer._id, invoice);
  return invoice.toJSON();
}

async function updateInvoiceReceived(user, dealerId, invoiceId, body = {}) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can update billing invoices');
  }
  if (!isValidObjectId(dealerId) || !isValidObjectId(invoiceId)) {
    throw ApiError.badRequest('Invalid id');
  }

  const invoice = await DealerInvoice.findOne({
    _id: invoiceId,
    dealerId: toObjectId(dealerId),
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');

  if (body.receivedAmount === undefined) {
    throw ApiError.badRequest('receivedAmount is required');
  }

  const receivedAmount = parseMoney(body.receivedAmount);
  const totalAmount = parseMoney(invoice.totalAmount);
  if (receivedAmount > totalAmount) {
    throw ApiError.badRequest('receivedAmount cannot exceed invoice total');
  }

  invoice.receivedAmount = receivedAmount;
  await invoice.save();
  await maybeMarkFilesPaid(user, dealerId, invoice);
  return invoice.toJSON();
}

module.exports = {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoiceReceived,
  peekNextBillNumber,
};
