const Dealer = require('../models/Dealer');
const DealerInvoice = require('../models/DealerInvoice');
const SequenceCounter = require('../models/SequenceCounter');
const ApiError = require('../utils/apiError');
const { escapeRegex } = require('../utils/regex');
const { isValidObjectId, toObjectId } = require('../utils/objectId');
const {
  markDealerFilesInvoiced,
  assertInvoiceLinesBillable,
} = require('./dealerInvoiceFiles.service');
const {
  sequenceCounterKeyForDate,
  formatDealerBillNumber,
  parseDealerBillNumber,
  billNumberPatternForDate,
  startOfLocalDay,
  startOfNextLocalDay,
} = require('../utils/invoiceNumber');

function trim(value) {
  return String(value || '').trim();
}

async function maxDayIndexFromExistingInvoices(at) {
  const dayStart = startOfLocalDay(at);
  const dayEnd = startOfNextLocalDay(at);
  const pattern = billNumberPatternForDate(at);

  const [byDate, byNumber] = await Promise.all([
    DealerInvoice.find({ generatedAt: { $gte: dayStart, $lt: dayEnd } })
      .select('billNumber invoiceSequence')
      .lean(),
    DealerInvoice.find({ billNumber: pattern }).select('billNumber invoiceSequence').lean(),
  ]);

  const seen = new Set();
  let maxIndex = 0;
  for (const row of [...byDate, ...byNumber]) {
    const id = String(row._id || row.billNumber);
    if (seen.has(id)) continue;
    seen.add(id);
    const parsed = parseDealerBillNumber(row.billNumber);
    if (parsed?.sequence > 0) {
      maxIndex = Math.max(maxIndex, parsed.sequence);
    } else if (Number.isFinite(row.invoiceSequence) && row.invoiceSequence > 0) {
      maxIndex = Math.max(maxIndex, row.invoiceSequence);
    }
  }
  return maxIndex;
}

async function ensureDailyInvoiceCounter(at = new Date()) {
  const key = sequenceCounterKeyForDate(at);
  const existing = await SequenceCounter.findOne({ key });
  if (existing) return existing;

  const maxIndex = await maxDayIndexFromExistingInvoices(at);

  try {
    return await SequenceCounter.create({ key, seq: maxIndex });
  } catch (err) {
    if (err?.code === 11000) {
      return SequenceCounter.findOne({ key });
    }
    throw err;
  }
}

async function peekNextBillNumber(user) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can view billing invoices');
  }
  const at = new Date();
  await ensureDailyInvoiceCounter(at);
  const key = sequenceCounterKeyForDate(at);
  const counter = await SequenceCounter.findOne({ key });
  const nextIndex = (counter?.seq ?? 0) + 1;
  return formatDealerBillNumber(nextIndex, at);
}

async function reserveNextBillNumber(at = new Date()) {
  await ensureDailyInvoiceCounter(at);
  const key = sequenceCounterKeyForDate(at);
  const updated = await SequenceCounter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true });
  if (!updated) {
    throw ApiError.badRequest('Could not allocate invoice number');
  }
  const billNumber = formatDealerBillNumber(updated.seq, at);
  const parsed = parseDealerBillNumber(billNumber);
  return {
    billNumber,
    invoiceSequence: updated.seq,
    invoiceFy: parsed?.month ? `${parsed.day || ''}${parsed.month}` : '',
  };
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

/** Once a file is on a saved dealer invoice, mark paymentDone so it leaves the billing pick list. */
async function markInvoiceLineFilesPaid(user, dealerId, invoice) {
  if (invoice.filesMarkedPaid) return invoice;

  const fileIds = invoice.lines.map((l) => String(l.fileId));
  await markDealerFilesInvoiced(user, String(dealerId), fileIds);
  invoice.filesMarkedPaid = true;
  await invoice.save();
  return invoice;
}

function buildInvoiceTrackingSearchQuery(rawSearch) {
  const search = trim(rawSearch);
  if (!search) return null;

  const or = [
    { billNumber: new RegExp(escapeRegex(search), 'i') },
    { 'dealerSnapshot.name': new RegExp(escapeRegex(search), 'i') },
  ];

  const digits = search.replace(/[^\d]/g, '');
  if (digits.length >= 1) {
    const num = Number(digits);
    if (Number.isFinite(num)) {
      or.push({ totalAmount: num });
      or.push({ receivedAmount: num });
    }
  }

  return { $or: or };
}

async function listInvoices(user, { dealerId, page = 1, pageSize = 20, limit, q = '' } = {}) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can view billing invoices');
  }
  const query = {};
  if (dealerId) {
    if (!isValidObjectId(dealerId)) throw ApiError.badRequest('Invalid dealer id');
    query.dealerId = toObjectId(dealerId);
  }

  const searchQuery = buildInvoiceTrackingSearchQuery(q);
  if (searchQuery) {
    if (query.dealerId) {
      query.$and = [{ dealerId: query.dealerId }, searchQuery];
      delete query.dealerId;
    } else {
      Object.assign(query, searchQuery);
    }
  }

  const legacyLimit = Number(limit);
  const safePageSize = Math.min(
    Math.max(Number(pageSize) || (Number.isFinite(legacyLimit) ? legacyLimit : 20), 1),
    100
  );
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safePageSize;

  const [total, rows] = await Promise.all([
    DealerInvoice.countDocuments(query),
    DealerInvoice.find(query).sort({ generatedAt: -1 }).skip(skip).limit(safePageSize),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);
  const pageClamped = Math.min(safePage, totalPages);

  let invoiceRows = rows;
  if (pageClamped !== safePage && total > 0) {
    invoiceRows = await DealerInvoice.find(query)
      .sort({ generatedAt: -1 })
      .skip((pageClamped - 1) * safePageSize)
      .limit(safePageSize);
  }

  return {
    invoices: invoiceRows.map((row) => row.toJSON()),
    total,
    page: pageClamped,
    pageSize: safePageSize,
    totalPages,
  };
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

  const generatedAt = body.generatedAt ? new Date(body.generatedAt) : new Date();

  let billNumber = trim(body.billNumber);
  let invoiceSequence;
  let invoiceFy = '';
  if (billNumber) {
    const existing = await DealerInvoice.findOne({ billNumber });
    if (existing) throw ApiError.conflict('An invoice with this number already exists');
    const parsed = parseDealerBillNumber(billNumber);
    if (parsed?.sequence) invoiceSequence = parsed.sequence;
    if (parsed?.month) invoiceFy = `${parsed.day || ''}${parsed.month}`;
    else if (parsed?.fy) invoiceFy = parsed.fy;
  } else {
    const allocated = await reserveNextBillNumber(generatedAt);
    billNumber = allocated.billNumber;
    invoiceSequence = allocated.invoiceSequence;
    invoiceFy = allocated.invoiceFy;
  }

  const lines = normalizeLines(body.lines);
  await assertInvoiceLinesBillable(dealer, lines);

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  const receivedAmount = parseMoney(body.receivedAmount);
  if (receivedAmount > totalAmount) {
    throw ApiError.badRequest('receivedAmount cannot exceed invoice total');
  }

  let invoice = await DealerInvoice.create({
    dealerId: dealer._id,
    billNumber,
    invoiceSequence,
    invoiceFy,
    generatedAt,
    dealerSnapshot: dealerSnapshotFrom(dealer),
    lines,
    totalAmount,
    receivedAmount,
    createdBy: user._id,
  });

  try {
    invoice = await markInvoiceLineFilesPaid(user, dealer._id, invoice);
  } catch {
    // Keep invoice in history even if file payment flags fail (admin can run sync-legacy-files).
    invoice.filesMarkedPaid = false;
    await invoice.save();
  }
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
  await markInvoiceLineFilesPaid(user, dealerId, invoice);
  return invoice.toJSON();
}

/** Backfill paymentDone for files on saved invoices (e.g. before mark-on-create fix). */
async function repairInvoicedFilesPaymentDone(user) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can repair invoiced files');
  }
  const invoices = await DealerInvoice.find({});
  let invoicesProcessed = 0;
  let filesMarked = 0;
  for (const invoice of invoices) {
    const wasMarked = invoice.filesMarkedPaid;
    try {
      await markInvoiceLineFilesPaid(user, invoice.dealerId, invoice);
      invoicesProcessed += 1;
      if (!wasMarked) {
        filesMarked += (invoice.lines || []).length;
      }
    } catch {
      // Skip broken rows; admin can fix dealer/file linkage manually.
    }
  }
  return { invoicesProcessed, filesMarked, invoiceCount: invoices.length };
}

module.exports = {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoiceReceived,
  peekNextBillNumber,
  repairInvoicedFilesPaymentDone,
};
