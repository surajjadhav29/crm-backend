/**
 * Invoice / billing: list files for one dealer with AND filters (RTO, bill range, etc.).
 * Does not alter File Records list behaviour (Suraj's file.service list/paginate paths).
 */
const File = require('../models/File');
const Dealer = require('../models/Dealer');
const DealerInvoice = require('../models/DealerInvoice');
const ApiError = require('../utils/apiError');
const { exactInsensitive } = require('../utils/regex');
const { isValidObjectId, toObjectId } = require('../utils/objectId');
const {
  buildDateFilterQuery,
  buildDateRangeFilterQuery,
  matchesDateFilter,
} = require('../utils/date');
const { normalizeDealerInvoiceFilters } = require('../utils/dealerInvoiceFileFilters');
const {
  buildScopeQuery,
  toPublicFile,
  matchesSearch,
  buildSearchQuery,
} = require('./file.service');
const { linkLegacyFilesToDealer } = require('./dealer.service');
const { dealerNameExactQuery } = require('../utils/dealerNameKey');

const FILE_LIST_SORT = { lastStatusAt: -1, createdAt: -1 };

function buildDealerBillingFileScope(dealer) {
  const nameMatch = dealerNameExactQuery(dealer.name);
  if (!nameMatch) return { dealerId: dealer._id };
  return {
    $or: [
      { dealerId: dealer._id },
      {
        $and: [
          { $or: [{ dealerId: null }, { dealerId: { $exists: false } }] },
          { dealerName: nameMatch },
        ],
      },
    ],
  };
}

function normalizeDealerDisplayName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

async function findDealerInvoiceFilesByIds(dealer, rawFileIds, { requireUnpaid = false } = {}) {
  await linkLegacyFilesToDealer(dealer);

  const fileIds = Array.isArray(rawFileIds)
    ? [...new Set(rawFileIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  if (!fileIds.length) return [];
  if (fileIds.some((id) => !isValidObjectId(id))) {
    throw ApiError.badRequest('Invalid file id');
  }

  const objectIds = fileIds.map((id) => toObjectId(id)).filter(Boolean);
  const queryParts = [
    { _id: { $in: objectIds } },
    { status: { $ne: 'paper_return' } },
    buildDealerBillingFileScope(dealer),
  ];
  if (requireUnpaid) {
    queryParts.push({ paymentDone: { $ne: true } });
  }

  return File.find(combineQueryParts(queryParts));
}

/** Validate invoice lines before create — same rules as billing file pick list. */
async function assertInvoiceLinesBillable(dealer, lines) {
  const ids = lines.map((line) => String(line.fileId));
  const files = await findDealerInvoiceFilesByIds(dealer, ids, { requireUnpaid: true });
  if (files.length !== lines.length) {
    throw ApiError.badRequest(
      'One or more files are invalid, already invoiced or paid, excluded, or belong to another dealer'
    );
  }
  for (const file of files) {
    const bill = Number(file.totalBill) || 0;
    if (bill <= 0) {
      throw ApiError.badRequest('Cannot invoice files with zero bill amount');
    }
  }
}

function appendRtoNameFilter(parts, rtoName) {
  if (!rtoName) return;
  const names = String(rtoName)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) return;
  if (names.length === 1) {
    parts.push({ rtoName: exactInsensitive(names[0]) });
    return;
  }
  parts.push({ $or: names.map((name) => ({ rtoName: exactInsensitive(name) })) });
}

function parseBillAmount(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function appendTotalBillFilter(parts, minBill, maxBill) {
  const min = parseBillAmount(minBill);
  const max = parseBillAmount(maxBill);
  if (min !== null && max !== null) {
    parts.push({ totalBill: { $gte: min, $lte: max } });
    return;
  }
  if (min !== null) parts.push({ totalBill: { $gte: min } });
  if (max !== null) parts.push({ totalBill: { $lte: max } });
}

function appendInvoiceFilters(parts, filters) {
  appendRtoNameFilter(parts, filters.rtoName);
  if (filters.workType) parts.push({ workType: exactInsensitive(filters.workType) });

  const dateQuery =
    buildDateFilterQuery({ date: filters.date, datePreset: filters.datePreset }) ||
    buildDateRangeFilterQuery({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });
  if (dateQuery) parts.push(dateQuery);

  const searchQuery = buildSearchQuery(filters.search);
  if (searchQuery) parts.push(searchQuery);

  appendTotalBillFilter(parts, filters.minBill, filters.maxBill);
}

function combineQueryParts(parts) {
  const nonEmpty = parts.filter((p) => p && Object.keys(p).length);
  if (!nonEmpty.length) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];
  return { $and: nonEmpty };
}

function splitCsvFilter(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasActiveInvoiceFilters(filters) {
  return Boolean(
    filters.filterUserId ||
      filters.rtoName ||
      filters.workType ||
      filters.search ||
      filters.date ||
      filters.datePreset ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.minBill ||
      filters.maxBill
  );
}

function matchesDateRangeFilter(file, dateFrom, dateTo) {
  const q = buildDateRangeFilterQuery({ dateFrom, dateTo });
  if (!q) return true;
  const day = String(file.date || '').slice(0, 10);
  if (q.date && typeof q.date === 'object') {
    if (q.date.$gte && day < q.date.$gte) return false;
    if (q.date.$lte && day > q.date.$lte) return false;
    return true;
  }
  if (q.date) return day === q.date;
  return true;
}

/** All supplied invoice filters must match (AND). */
function matchesInvoiceFilters(file, filters, user) {
  const doc = typeof file.toObject === 'function' ? file.toObject() : file;

  if (user?.role !== 'superadmin') {
    if (String(doc.createdBy) !== String(user._id)) return false;
  } else if (filters.filterUserId) {
    if (String(doc.createdBy) !== String(filters.filterUserId)) return false;
  }

  if (filters.rtoName) {
    const wanted = splitCsvFilter(filters.rtoName);
    const got = String(doc.rtoName || '').trim().toLowerCase();
    if (!wanted.some((name) => got === name.toLowerCase())) return false;
  }

  if (filters.workType) {
    const wanted = String(filters.workType).trim().toLowerCase();
    if (String(doc.workType || '').trim().toLowerCase() !== wanted) return false;
  }

  const bill = Number(doc.totalBill) || 0;
  const min = parseBillAmount(filters.minBill);
  const max = parseBillAmount(filters.maxBill);
  if (min !== null && bill < min) return false;
  if (max !== null && bill > max) return false;

  if (filters.dateFrom || filters.dateTo) {
    if (!matchesDateRangeFilter(doc, filters.dateFrom, filters.dateTo)) return false;
  } else if (!matchesDateFilter(doc, { date: filters.date, datePreset: filters.datePreset })) {
    return false;
  }

  if (filters.search && !matchesSearch(doc, filters.search)) return false;

  return true;
}

async function listFilesForDealerInvoice(user, dealerId, rawFilters = {}) {
  const filters = normalizeDealerInvoiceFilters(rawFilters);

  if (!isValidObjectId(dealerId)) {
    throw ApiError.badRequest('Invalid dealer id');
  }

  const dealer = await Dealer.findById(dealerId);
  if (!dealer) {
    throw ApiError.notFound('Dealer not found');
  }

  await linkLegacyFilesToDealer(dealer);

  const parts = [];
  const scope = buildScopeQuery(user, filters.filterUserId);
  if (Object.keys(scope).length) parts.push(scope);

  parts.push(buildDealerBillingFileScope(dealer));

  const invoicedFileIds = await DealerInvoice.distinct('lines.fileId', { dealerId: dealer._id });
  if (invoicedFileIds.length) {
    parts.push({ _id: { $nin: invoicedFileIds } });
  }

  /** Invoice only includes files still awaiting payment (not paper return). */
  parts.push({ paymentDone: { $ne: true } });
  parts.push({ status: { $ne: 'paper_return' } });

  appendInvoiceFilters(parts, filters);

  const query = combineQueryParts(parts);

  let rows = await File.find(query).sort(FILE_LIST_SORT);
  rows = rows.filter(
    (f) => !f.paymentDone && String(f.status || '') !== 'paper_return'
  );
  if (hasActiveInvoiceFilters(filters)) {
    rows = rows.filter((f) => matchesInvoiceFilters(f, filters, user));
  }

  return {
    files: rows.map((f) => toPublicFile(f, user)),
    total: rows.length,
  };
}

async function markDealerFilesInvoiced(user, dealerId, rawFileIds = []) {
  if (user?.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can mark dealer invoice payments');
  }

  if (!isValidObjectId(dealerId)) {
    throw ApiError.badRequest('Invalid dealer id');
  }

  const dealer = await Dealer.findById(dealerId).select('_id name');
  if (!dealer) {
    throw ApiError.notFound('Dealer not found');
  }

  await linkLegacyFilesToDealer(dealer);

  const fileIds = Array.isArray(rawFileIds)
    ? [...new Set(rawFileIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];

  if (!fileIds.length) {
    throw ApiError.badRequest('fileIds is required');
  }

  if (fileIds.some((id) => !isValidObjectId(id))) {
    throw ApiError.badRequest('Invalid file id in fileIds');
  }

  const files = await findDealerInvoiceFilesByIds(dealer, fileIds, { requireUnpaid: false });

  if (files.length !== fileIds.length) {
    throw ApiError.badRequest(
      'One or more files were not found, excluded from billing, or belong to another dealer'
    );
  }

  const displayName = normalizeDealerDisplayName(dealer.name);
  const idsToMark = [];
  for (const file of files) {
    const bill = Number(file.totalBill) || 0;
    if (bill <= 0) {
      throw ApiError.badRequest('Cannot mark payment done for files with zero bill amount');
    }
    if (!file.dealerId) {
      file.dealerId = dealer._id;
      file.dealerName = displayName;
      await file.save();
    }
    if (!file.paymentDone) {
      idsToMark.push(file._id);
    }
  }

  if (idsToMark.length) {
    await File.updateMany(
      { _id: { $in: idsToMark } },
      { $set: { paymentDone: true, dealerId: dealer._id, dealerName: displayName } }
    );
  }

  return { updated: idsToMark.length, fileIds };
}

module.exports = {
  listFilesForDealerInvoice,
  markDealerFilesInvoiced,
  assertInvoiceLinesBillable,
};
