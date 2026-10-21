/**
 * Invoice / billing: list files for one dealer with AND filters (RTO, bill range, etc.).
 * Does not alter File Records list behaviour (Suraj's file.service list/paginate paths).
 */
const File = require('../models/File');
const Dealer = require('../models/Dealer');
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
const { dealerNameExactQuery } = require('../utils/dealerNameKey');
const { splitFileExpensesForInvoice } = require('../utils/fileExpenseSplit');

const FILE_LIST_SORT = { lastStatusAt: -1, createdAt: -1 };

const BILLING_FILES_PAGE_SIZE_DEFAULT = 50;
const BILLING_FILES_PAGE_SIZE_MAX = 200;
const BILLING_FILES_RESOLVE_IDS_MAX = 300;

/** Billing pick list does not need status / paper location history (large on old files). */
const BILLING_FILE_LIST_PROJECTION = '-statusHistory -paperLocationHistory';

function parseSafePage(value) {
  return Math.max(1, parseInt(value, 10) || 1);
}

function parseSafePageSize(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return BILLING_FILES_PAGE_SIZE_DEFAULT;
  return Math.min(BILLING_FILES_PAGE_SIZE_MAX, n);
}

function parseResolveFileIds(raw) {
  const ids = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length > BILLING_FILES_RESOLVE_IDS_MAX) {
    throw ApiError.badRequest(
      `You can resolve at most ${BILLING_FILES_RESOLVE_IDS_MAX} files at once`
    );
  }
  if (unique.some((id) => !isValidObjectId(id))) {
    throw ApiError.badRequest('Invalid file id in fileIds');
  }
  return unique.map((id) => toObjectId(id)).filter(Boolean);
}

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
      'One or more files are invalid, still marked Paid, excluded, or belong to another dealer'
    );
  }
  for (const file of files) {
    const bill = Number(file.totalBill) || 0;
    if (bill <= 0) {
      throw ApiError.badRequest('Cannot invoice files with zero bill amount');
    }
  }
}

function trim(value) {
  return String(value || '').trim();
}

/** Snapshot RTO + expense split from live file rows (source of truth on create). */
async function enrichInvoiceLinesFromFiles(dealer, lines) {
  const ids = lines.map((line) => String(line.fileId));
  const files = await findDealerInvoiceFilesByIds(dealer, ids, { requireUnpaid: true });
  if (files.length !== lines.length) {
    throw ApiError.badRequest(
      'One or more files are invalid, still marked Paid, excluded, or belong to another dealer'
    );
  }
  const byId = new Map(files.map((f) => [String(f._id), f]));
  return lines.map((line) => {
    const file = byId.get(String(line.fileId));
    const split = splitFileExpensesForInvoice(file.expenses, file.totalBill);
    if (split.amount <= 0) {
      throw ApiError.badRequest('Cannot invoice files with zero bill amount');
    }
    return {
      fileId: line.fileId,
      vehicleNo: trim(file.vehicleNo),
      vehicleModel: trim(file.vehicleModel),
      rtoName: trim(file.rtoName),
      workType: trim(file.workType),
      fileNumber: trim(file.fileNumber),
      extraAmount: split.extraAmount,
      dealAmount: split.dealAmount,
      amount: split.amount,
    };
  });
}

function appendRtoNameFilter(parts, rtoName) {
  if (!rtoName) return;
  const names = splitCsvFilter(rtoName);
  if (!names.length) return;
  if (names.length === 1) {
    parts.push({ rtoName: exactInsensitive(names[0]) });
    return;
  }
  parts.push({ $or: names.map((name) => ({ rtoName: exactInsensitive(name) })) });
}

function appendWorkTypeFilter(parts, workType) {
  if (!workType) return;
  const names = splitCsvFilter(workType);
  if (!names.length) return;
  if (names.length === 1) {
    parts.push({ workType: exactInsensitive(names[0]) });
    return;
  }
  parts.push({ $or: names.map((name) => ({ workType: exactInsensitive(name) })) });
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
  appendWorkTypeFilter(parts, filters.workType);

  const dateQuery = buildDateFilterQuery({
    date: filters.date,
    datePreset: filters.datePreset,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
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
    const wanted = splitCsvFilter(filters.filterUserId);
    if (!wanted.some((id) => String(doc.createdBy) === String(id))) return false;
  }

  if (filters.rtoName) {
    const wanted = splitCsvFilter(filters.rtoName);
    const got = String(doc.rtoName || '').trim().toLowerCase();
    if (!wanted.some((name) => got === name.toLowerCase())) return false;
  }

  if (filters.workType) {
    const wanted = splitCsvFilter(filters.workType);
    const got = String(doc.workType || '').trim().toLowerCase();
    if (!wanted.some((name) => got === name.toLowerCase())) return false;
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

function buildDealerInvoiceFileBaseParts(user, dealer) {
  const parts = [];
  parts.push(buildDealerBillingFileScope(dealer));
  /**
   * Billable when not marked paid on the file record. Invoicing sets paymentDone;
   * admins can set Unpaid again in File Records to allow a new invoice line-up.
   * (Past invoices in history are unchanged.)
   */
  parts.push({ paymentDone: { $ne: true } });
  parts.push({ status: { $ne: 'paper_return' } });
  return parts;
}

function buildDealerInvoiceFileQuery(user, dealer, filters) {
  const parts = [];
  const scope = buildScopeQuery(user, filters.filterUserId);
  if (Object.keys(scope).length) parts.push(scope);

  parts.push(...buildDealerInvoiceFileBaseParts(user, dealer));

  appendInvoiceFilters(parts, filters);

  return combineQueryParts(parts);
}

/** Resolve explicit file ids: dealer + assignee scope only (no RTO/date/search column filters). */
function buildDealerInvoiceFileResolveQuery(user, dealer, filters) {
  const parts = [];
  const scope = buildScopeQuery(user, filters.filterUserId);
  if (Object.keys(scope).length) parts.push(scope);
  parts.push(...buildDealerInvoiceFileBaseParts(user, dealer));
  return combineQueryParts(parts);
}

async function listFilesForDealerInvoice(user, dealerId, rawFilters = {}) {
  const filters = normalizeDealerInvoiceFilters(rawFilters);
  const page = parseSafePage(rawFilters.page);
  const pageSize = parseSafePageSize(rawFilters.pageSize);
  const billableIdsOnly = Boolean(rawFilters.billableIdsOnly);
  const resolveIdsRaw = rawFilters.fileIds;

  if (!isValidObjectId(dealerId)) {
    throw ApiError.badRequest('Invalid dealer id');
  }

  const dealer = await Dealer.findById(dealerId);
  if (!dealer) {
    throw ApiError.notFound('Dealer not found');
  }

  // Legacy dealerId backfill: POST /dealers/sync-legacy-files (or create/rename dealer).
  // Billing queries still include name-only files via buildDealerBillingFileScope().
  const query = buildDealerInvoiceFileQuery(user, dealer, filters);
  const billableQuery = combineQueryParts([
    query,
    { totalBill: { $gt: 0 } },
  ]);

  if (billableIdsOnly) {
    const rows = await File.find(billableQuery).select('_id').lean();
    const fileIds = rows.map((row) => String(row._id));
    return {
      fileIds,
      total: fileIds.length,
      billableTotal: fileIds.length,
    };
  }

  if (resolveIdsRaw) {
    const objectIds = parseResolveFileIds(resolveIdsRaw);
    if (!objectIds.length) {
      return { files: [], total: 0, billableTotal: 0 };
    }
    const resolveQuery = buildDealerInvoiceFileResolveQuery(user, dealer, filters);
    const rows = await File.find({
      $and: [resolveQuery, { _id: { $in: objectIds } }],
    })
      .select(BILLING_FILE_LIST_PROJECTION)
      .sort(FILE_LIST_SORT);
    const files = rows.map((f) => toPublicFile(f, user));
    return {
      files,
      total: files.length,
      billableTotal: files.filter((f) => (Number(f.totalBill) || 0) > 0).length,
    };
  }

  const skip = (page - 1) * pageSize;
  const [total, billableTotal, rows] = await Promise.all([
    File.countDocuments(query),
    File.countDocuments(billableQuery),
    File.find(query)
      .select(BILLING_FILE_LIST_PROJECTION)
      .sort(FILE_LIST_SORT)
      .skip(skip)
      .limit(pageSize),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  return {
    files: rows.map((f) => toPublicFile(f, user)),
    total,
    billableTotal,
    page,
    pageSize,
    totalPages,
  };
}

async function markDealerFilesInvoiced(user, dealerId, rawFileIds = [], options = {}) {
  const { requireAllMarked = false } = options;

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
  const objectIds = fileIds.map((id) => toObjectId(id)).filter(Boolean);

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
  }

  if (requireAllMarked) {
    const updateResult = await File.updateMany(
      { _id: { $in: objectIds }, paymentDone: { $ne: true } },
      { $set: { paymentDone: true, dealerId: dealer._id, dealerName: displayName } }
    );
    if (updateResult.modifiedCount !== fileIds.length) {
      throw ApiError.conflict(
        'One or more files were already marked paid or invoiced. Refresh and try again.',
        'FILES_ALREADY_INVOICED'
      );
    }
    return { updated: updateResult.modifiedCount, fileIds };
  }

  const idsToMark = files.filter((f) => !f.paymentDone).map((f) => f._id);
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
  enrichInvoiceLinesFromFiles,
};
