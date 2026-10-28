const File = require('../models/File');
const Dealer = require('../models/Dealer');
const DealerInvoice = require('../models/DealerInvoice');
const SequenceCounter = require('../models/SequenceCounter');
const ApiError = require('../utils/apiError');
const { escapeRegex } = require('../utils/regex');
const { isValidObjectId, toObjectId } = require('../utils/objectId');
const {
  markDealerFilesInvoiced,
  assertInvoiceLinesBillable,
  enrichInvoiceLinesFromFiles,
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
  let invoiceFy = '';
  if (parsed?.year && parsed?.month) {
    invoiceFy = `${parsed.day || ''}${parsed.month}${parsed.year}`;
  } else if (parsed?.month) {
    invoiceFy = `${parsed.day || ''}${parsed.month}`;
  } else if (parsed?.fy) {
    invoiceFy = parsed.fy;
  }
  return {
    billNumber,
    invoiceSequence: updated.seq,
    invoiceFy,
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

  const total = await DealerInvoice.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);
  const pageClamped = Math.min(safePage, totalPages);
  const skip = (pageClamped - 1) * safePageSize;

  // Open (unpaid) → Partial → Paid; within each group newest first (not date-first overall).
  const docs = await DealerInvoice.aggregate([
    { $match: query },
    {
      $addFields: {
        _balance: {
          $max: [
            0,
            {
              $subtract: [
                { $ifNull: ['$totalAmount', 0] },
                { $ifNull: ['$receivedAmount', 0] },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        _statusRank: {
          $switch: {
            branches: [
              { case: { $lte: ['$_balance', 0] }, then: 2 },
              { case: { $gt: [{ $ifNull: ['$receivedAmount', 0] }, 0] }, then: 1 },
            ],
            default: 0,
          },
        },
      },
    },
    { $sort: { _statusRank: 1, generatedAt: -1 } },
    { $skip: skip },
    { $limit: safePageSize },
    { $project: { _balance: 0, _statusRank: 0 } },
  ]);

  return {
    invoices: docs.map((doc) => DealerInvoice.hydrate(doc).toJSON()),
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

  let generatedAt = new Date();
  if (body.generatedAt != null && body.generatedAt !== '') {
    const parsed = new Date(body.generatedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw ApiError.badRequest('Invalid generatedAt date');
    }
    generatedAt = parsed;
  }

  // Bill sequence always uses server "now" so clients cannot skew daily counters.
  const allocated = await reserveNextBillNumber(new Date());
  const billNumber = allocated.billNumber;
  const invoiceSequence = allocated.invoiceSequence;
  const invoiceFy = allocated.invoiceFy;

  const draftLines = normalizeLines(body.lines);
  await assertInvoiceLinesBillable(dealer, draftLines);
  const lines = await enrichInvoiceLinesFromFiles(dealer, draftLines);

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  const receivedAmount = parseMoney(body.receivedAmount);
  if (receivedAmount > totalAmount) {
    throw ApiError.badRequest('receivedAmount cannot exceed invoice total');
  }

  const lineFileIds = lines.map((line) => String(line.fileId));
  await markDealerFilesInvoiced(user, dealer._id, lineFileIds, { requireAllMarked: true });

  let invoice;
  try {
    invoice = await DealerInvoice.create({
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
      filesMarkedPaid: true,
    });
  } catch (err) {
    const objectIds = lineFileIds.map((id) => toObjectId(id)).filter(Boolean);
    if (objectIds.length) {
      await File.updateMany({ _id: { $in: objectIds } }, { $set: { paymentDone: false } });
    }
    throw err;
  }

  return invoice.toJSON();
}

/**
 * Update received amount and/or existing line Extra/Deal on the same invoice.
 * Line amounts are a snapshot only — File expenses/totalBill are updated by the
 * File Expenses API (Add Expenses popup), not collapsed here.
 */
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

  const hasLines = Array.isArray(body.lines);
  const hasReceived = body.receivedAmount !== undefined;

  if (!hasLines && !hasReceived) {
    throw ApiError.badRequest('receivedAmount or lines is required');
  }

  if (hasLines) {
    if (!body.lines.length) {
      throw ApiError.badRequest('lines cannot be empty');
    }

    const byFileId = new Map(
      (invoice.lines || []).map((line) => [String(line.fileId), line])
    );
    const seen = new Set();
    const nextLines = [];

    for (const raw of body.lines) {
      const fileId = trim(raw.fileId);
      if (!isValidObjectId(fileId) || !byFileId.has(fileId)) {
        throw ApiError.badRequest('Each line must reference a file already on this invoice');
      }
      if (seen.has(fileId)) {
        throw ApiError.badRequest('Duplicate file id in lines');
      }
      seen.add(fileId);

      const existing = byFileId.get(fileId);
      const extraAmount = parseMoney(raw.extraAmount);
      const dealAmount = parseMoney(raw.dealAmount);
      const amount = extraAmount + dealAmount;
      if (amount <= 0) {
        throw ApiError.badRequest('Each invoice line must have Extra + Deal greater than zero');
      }

      nextLines.push({
        fileId: existing.fileId,
        vehicleNo: existing.vehicleNo || '',
        vehicleModel: existing.vehicleModel || '',
        rtoName: existing.rtoName || '',
        workType: existing.workType || '',
        fileNumber: existing.fileNumber || '',
        extraAmount,
        dealAmount,
        amount,
      });
    }

    if (seen.size !== byFileId.size) {
      throw ApiError.badRequest('All existing invoice lines must be included when updating lines');
    }

    // Verify linked files still exist; do not overwrite detailed expenses.
    for (const line of nextLines) {
      const file = await File.findById(line.fileId).select('_id');
      if (!file) {
        throw ApiError.badRequest(`File not found for line ${line.fileNumber || line.fileId}`);
      }
    }

    invoice.lines = nextLines;
    invoice.totalAmount = nextLines.reduce((sum, line) => sum + parseMoney(line.amount), 0);
    invoice.markModified('lines');
  }

  const totalAmount = parseMoney(invoice.totalAmount);
  let receivedAmount = hasReceived
    ? parseMoney(body.receivedAmount)
    : parseMoney(invoice.receivedAmount);

  if (receivedAmount > totalAmount) {
    receivedAmount = totalAmount;
  }
  invoice.receivedAmount = receivedAmount;

  await invoice.save();
  return invoice.toJSON();
}

/**
 * Re-open invoice line files for billing (paymentDone = false).
 * Keeps the original invoice document unchanged (history / PDF stay as-is).
 * Optional body.fileIds — subset of this invoice's lines; default = all lines.
 */
async function reopenInvoiceFilesForBilling(user, dealerId, invoiceId, body = {}) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can re-open invoice files for billing');
  }
  if (!isValidObjectId(dealerId) || !isValidObjectId(invoiceId)) {
    throw ApiError.badRequest('Invalid id');
  }

  const invoice = await DealerInvoice.findOne({
    _id: invoiceId,
    dealerId: toObjectId(dealerId),
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');

  const lineFileIds = (invoice.lines || [])
    .map((line) => String(line.fileId || ''))
    .filter((id) => isValidObjectId(id));

  if (!lineFileIds.length) {
    throw ApiError.badRequest('This invoice has no file lines to re-open');
  }

  const requested = Array.isArray(body.fileIds)
    ? body.fileIds.map((id) => String(id || '')).filter((id) => isValidObjectId(id))
    : [];

  let targetIds = lineFileIds;
  if (requested.length) {
    const allowed = new Set(lineFileIds);
    targetIds = [...new Set(requested.filter((id) => allowed.has(id)))];
    if (!targetIds.length) {
      throw ApiError.badRequest('None of the selected files belong to this invoice');
    }
  }

  const objectIds = targetIds.map((id) => toObjectId(id)).filter(Boolean);
  const result = await File.updateMany(
    { _id: { $in: objectIds } },
    { $set: { paymentDone: false } }
  );

  return {
    invoiceId: String(invoice._id),
    dealerId: String(invoice.dealerId),
    billNumber: invoice.billNumber,
    fileIds: targetIds,
    filesReopened: Number(result.modifiedCount) || 0,
    filesMatched: Number(result.matchedCount) || 0,
  };
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
  reopenInvoiceFilesForBilling,
  peekNextBillNumber,
  repairInvoicedFilesPaymentDone,
};
