/**
 * Invoice / billing: list files for one dealer with AND filters (RTO, bill range, etc.).
 * Does not alter File Records list behaviour (Suraj's file.service list/paginate paths).
 */
const File = require('../models/File');
const Dealer = require('../models/Dealer');
const ApiError = require('../utils/apiError');
const { exactInsensitive, escapeRegex } = require('../utils/regex');
const { isValidObjectId } = require('../utils/objectId');
const {
  buildDateFilterQuery,
  buildDateRangeFilterQuery,
  matchesDateFilter,
} = require('../utils/date');
const { normalizeDealerInvoiceFilters } = require('../utils/dealerInvoiceFileFilters');
const { buildScopeQuery, toPublicFile, matchesSearch } = require('./file.service');

const FILE_LIST_SORT = { lastStatusAt: -1, createdAt: -1 };

function buildSearchQuery(search) {
  if (!search || !String(search).trim()) return null;
  const re = new RegExp(escapeRegex(String(search).trim()), 'i');
  return {
    $or: [
      { fileNumber: re },
      { ownerName: re },
      { oldOwnerName: re },
      { vehicleNo: re },
      { vehicleModel: re },
      { dealerName: re },
      { workType: re },
      { rtoName: re },
    ],
  };
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

function matchesDealerFileRecord(file, dealer) {
  const doc = typeof file.toObject === 'function' ? file.toObject() : file;
  const dealerId = doc.dealerId ? String(doc.dealerId) : '';
  if (dealerId && dealerId === String(dealer._id)) return true;
  const fileName = String(doc.dealerName || '').trim().toLowerCase();
  const dealerName = String(dealer.name || '').trim().toLowerCase();
  return Boolean(fileName && dealerName && fileName === dealerName);
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

  const dealer = await Dealer.findById(dealerId).select('name');
  if (!dealer) {
    throw ApiError.notFound('Dealer not found');
  }

  const parts = [];
  const scope = buildScopeQuery(user, filters.filterUserId);
  if (Object.keys(scope).length) parts.push(scope);

  parts.push({
    $or: [{ dealerId: dealer._id }, { dealerName: exactInsensitive(dealer.name) }],
  });

  /** Invoice only includes files still awaiting payment. */
  parts.push({ paymentDone: { $ne: true } });

  appendInvoiceFilters(parts, filters);

  const query = combineQueryParts(parts);

  let rows = await File.find(query).sort(FILE_LIST_SORT);
  rows = rows.filter((f) => matchesDealerFileRecord(f, dealer) && !f.paymentDone);
  if (hasActiveInvoiceFilters(filters)) {
    rows = rows.filter((f) => matchesInvoiceFilters(f, filters, user));
  }

  return {
    files: rows.map((f) => toPublicFile(f, user)),
    total: rows.length,
  };
}

module.exports = { listFilesForDealerInvoice };
