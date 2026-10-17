const File = require('../models/File');
const Counter = require('../models/Counter');
const User = require('../models/User');
const WorkType = require('../models/WorkType');
const FieldAgent = require('../models/FieldAgent');
const ApiError = require('../utils/apiError');
const { escapeRegex, exactInsensitive } = require('../utils/regex');
const { isValidObjectId, toObjectId } = require('../utils/objectId');
const {
  FILE_STATUSES,
  EDITABLE_FIELDS,
  REQUIRED_CREATE_FIELDS,
  EXPENSE_FIELDS,
  NEW_OWNER_WORK_TYPES,
  FILE_NUMBER_PREFIX,
  FILE_NUMBER_BASE,
  FILE_NUMBER_COUNTER_ID,
} = require('../constants/file.constants');
const { normalizeDocuments, normalizeWorkTypeName } = require('../constants/workType.constants');
const { todayDateString, buildDateFilterQuery, matchesDateFilter } = require('../utils/date');

/** Recently status-changed (or created) files first; tie-break by createdAt. */
const FILE_LIST_SORT = { lastStatusAt: -1, createdAt: -1 };

/* ------------------------------------------------------------------ */
/* Pure domain helpers (no I/O) — reusable across services            */
/* ------------------------------------------------------------------ */

/** Hold Sheet = files manually marked On Hold only (no auto age rule). */
function isHoldFile(file) {
  return file.status === 'on_hold';
}

function matchesView(file, type) {
  switch (type) {
    case 'all':
      return ['pending', 'in_progress'].includes(file.status);
    case 'hold':
      return isHoldFile(file);
    case 'return_paper':
      return file.status === 'paper_return';
    case 'objection':
      return file.status === 'objection';
    case 'pending':
      return file.status === 'pending';
    case 'in_progress':
      return file.status === 'in_progress';
    case 'completed':
      return ['completed', 'done'].includes(file.status);
    case 'all_records':
    default:
      return true;
  }
}

/** Mongo filter fragment for a Files tab / export view. */
function buildViewQuery(type) {
  switch (type) {
    case 'all':
      return { status: { $in: ['pending', 'in_progress'] } };
    case 'hold':
      return { status: 'on_hold' };
    case 'return_paper':
      return { status: 'paper_return' };
    case 'objection':
      return { status: 'objection' };
    case 'pending':
      return { status: 'pending' };
    case 'in_progress':
      return { status: 'in_progress' };
    case 'completed':
      return { status: { $in: ['completed', 'done'] } };
    case 'all_records':
    default:
      return {};
  }
}

/**
 * Files search fields. Client name on the table is ownerName (new owner)
 * when set, otherwise oldOwnerName — both are searched.
 */
const SEARCH_FIELDS = [
  'fileNumber',
  'date',
  'dealerName',
  'workType',
  'vehicleNo',
  'vehicleModel',
  'chassisNo',
  'engineNo',
  'oldOwnerName',
  'ownerName',
  'oldOwnerMob',
  'newOwnerMob',
  'dealerMob',
  'rtoName',
  'remarks',
  'documents',
];

const MOBILE_SEARCH_FIELDS = ['oldOwnerMob', 'newOwnerMob', 'dealerMob'];

function compactSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-_/. ,()]+/g, '');
}

/**
 * "RK" matches "R K FINANCE", "MH12" matches "MH-12" / "MH12 - PUNE",
 * "wagonr" matches "WAGON R". Separators in the stored value are optional.
 */
function separatorInsensitiveRegex(value) {
  const chars = [...compactSearchText(value)];
  if (!chars.length) return null;
  return new RegExp(chars.map((ch) => escapeRegex(ch)).join('[\\s\\-_/. ,()]*'), 'i');
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Phone-style match: same digit order with optional +91 / spaces / dashes between digits. */
function digitsFlexibleRegex(digits) {
  if (!digits || digits.length < 4) return null;
  return new RegExp(digits.split('').map((ch) => escapeRegex(ch)).join('\\D*'));
}

function buildSearchQuery(search) {
  const raw = String(search || '').trim();
  if (!raw) return null;

  const orClauses = [];

  const re = separatorInsensitiveRegex(raw);
  if (re) {
    for (const field of SEARCH_FIELDS) {
      orClauses.push({ [field]: re });
    }
  }

  const digits = digitsOnly(raw);
  if (digits.length >= 4) {
    const mobileDigits = digits.length > 10 ? digits.slice(-10) : digits;
    const mobileRe = digitsFlexibleRegex(mobileDigits);
    if (mobileRe) {
      for (const field of MOBILE_SEARCH_FIELDS) {
        orClauses.push({ [field]: mobileRe });
      }
    }
  }

  if (!orClauses.length) return null;
  return { $or: orClauses };
}

/** Query string, comma list, or repeated params → unique trimmed names. */
function parseFilterList(value) {
  if (value == null || value === '') return [];
  const parts = Array.isArray(value) ? value : [value];
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    for (const item of String(part).split(',')) {
      const name = item.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

function fieldInQuery(field, value) {
  const list = parseFilterList(value);
  if (!list.length) return null;
  if (list.length === 1) return { [field]: exactInsensitive(list[0]) };
  return { $or: list.map((name) => ({ [field]: exactInsensitive(name) })) };
}

function matchesFilterList(fileValue, filterValue) {
  const list = parseFilterList(filterValue);
  if (!list.length) return true;
  const current = String(fileValue || '').toLowerCase();
  return list.some((name) => name.toLowerCase() === current);
}

function buildListQuery(
  user,
  {
    type = 'all_records',
    search = '',
    filterUserId,
    rtoName,
    workType,
    dealerName,
    date,
    dateFrom,
    dateTo,
    datePreset,
  } = {}
) {
  const parts = [buildScopeQuery(user, filterUserId)];

  const view = buildViewQuery(type);
  if (Object.keys(view).length) parts.push(view);

  const rtoQuery = fieldInQuery('rtoName', rtoName);
  if (rtoQuery) parts.push(rtoQuery);
  if (workType) parts.push({ workType: exactInsensitive(workType) });
  const dealerQuery = fieldInQuery('dealerName', dealerName);
  if (dealerQuery) parts.push(dealerQuery);

  const dateQuery = buildDateFilterQuery({ date, datePreset, dateFrom, dateTo });
  if (dateQuery) parts.push(dateQuery);

  const searchQuery = buildSearchQuery(search);
  if (searchQuery) parts.push(searchQuery);

  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

// Column filters (exact match). Empty/undefined values are ignored so callers
// can pass a partial filter object safely.
function matchesFilters(file, { rtoName, workType, dealerName, date, dateFrom, dateTo, datePreset } = {}) {
  if (!matchesFilterList(file.rtoName, rtoName)) return false;
  if (workType && file.workType !== workType) return false;
  if (!matchesFilterList(file.dealerName, dealerName)) return false;
  return matchesDateFilter(file, { date, datePreset, dateFrom, dateTo });
}

function matchesSearch(file, search) {
  const needle = compactSearchText(search);
  if (!needle) return true;
  const values = SEARCH_FIELDS.flatMap((field) => {
    const value = file[field];
    return Array.isArray(value) ? value : [value];
  });
  return values.some((value) => compactSearchText(value).includes(needle));
}

function requiresNewOwner(workType) {
  const normalized = (workType || '').toUpperCase().replace(/\s+/g, '');
  if (NEW_OWNER_WORK_TYPES.includes(normalized)) return true;
  return normalized === 'TO' || normalized.startsWith('TO+') || normalized.startsWith('TO&');
}

// Canonical form for a vehicle number: no spaces, upper-cased. This makes
// "MH 12 AB 1234" and "mh12ab1234" collapse to the same value so uniqueness
// checks (and the DB unique index) actually catch duplicates.
function normalizeVehicleNo(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

const MOBILE_RE = /^\d{10}$/;

// Chassis / engine: letters, digits, and special characters; no spaces; exactly 5.
function normalizeChassisEngine(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

// Server-side format validation so direct API calls can't bypass the UI rules.
// Only fields present in `payload` are checked (safe for partial updates).
function assertValidFileFields(payload) {
  const has = (field) => payload[field] !== undefined && payload[field] !== null;

  for (const field of ['chassisNo', 'engineNo']) {
    if (has(field)) {
      const normalized = normalizeChassisEngine(payload[field]);
      payload[field] = normalized;
      if (normalized.length !== 5) {
        const label = field === 'chassisNo' ? 'Chassis' : 'Engine';
        throw ApiError.badRequest(
          `${label} number must be exactly 5 characters (letters, digits, or special characters)`
        );
      }
    }
  }

  if (has('oldOwnerMob') && !MOBILE_RE.test(String(payload.oldOwnerMob).trim())) {
    throw ApiError.badRequest('Old owner mobile must be a 10 digit number');
  }

  // Optional mobiles: only enforced when a non-empty value is supplied.
  for (const field of ['newOwnerMob', 'dealerMob']) {
    if (has(field)) {
      const val = String(payload[field]).trim();
      if (val && !MOBILE_RE.test(val)) {
        const label = field === 'newOwnerMob' ? 'New owner' : 'Dealer';
        throw ApiError.badRequest(`${label} mobile must be a 10 digit number`);
      }
    }
  }
}

function normalizeExpenses(source = {}) {
  return EXPENSE_FIELDS.reduce((acc, field) => {
    acc[field] = Number(source[field]) || 0;
    return acc;
  }, {});
}

function sumExpenses(expenses) {
  return EXPENSE_FIELDS.reduce((sum, field) => sum + (Number(expenses[field]) || 0), 0);
}

function canAccess(file, user) {
  return user.role === 'superadmin' || file.createdBy.toString() === user._id.toString();
}

/**
 * Serialize a file for API responses.
 * Staff never receive setDeal (and totalBill excludes it so it cannot be inferred).
 */
function toPublicFile(file, user) {
  const json = typeof file.toJSON === 'function' ? file.toJSON() : { ...file };
  if (user?.role === 'superadmin') return json;

  const setDeal = Number(json.expenses?.setDeal) || 0;
  if (json.expenses) {
    json.expenses = { ...json.expenses, setDeal: 0 };
  }
  json.totalBill = Math.max(0, (Number(json.totalBill) || 0) - setDeal);
  return json;
}

/* ------------------------------------------------------------------ */
/* Data access helpers                                                 */
/* ------------------------------------------------------------------ */

function buildScopeQuery(user, filterUserId) {
  const query = {};
  if (user.role !== 'superadmin') {
    query.createdBy = user._id;
  } else if (filterUserId) {
    // Aggregate $match needs a real ObjectId; string ids match 0 docs.
    const oid = toObjectId(filterUserId);
    query.createdBy = oid || filterUserId;
  }
  return query;
}

/** @deprecated Prefer buildListQuery — kept for rare callers that need every scoped doc. */
async function getScopedFiles(user, filterUserId) {
  return File.find(buildScopeQuery(user, filterUserId)).sort(FILE_LIST_SORT);
}

async function getAccessibleFile(id, user) {
  const file = await File.findById(id);
  if (!file || !canAccess(file, user)) {
    throw ApiError.notFound('File not found');
  }
  return file;
}

async function nextFileNumber() {
  const counter = await Counter.findOneAndUpdate(
    { _id: FILE_NUMBER_COUNTER_ID },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${FILE_NUMBER_PREFIX}${FILE_NUMBER_BASE + counter.seq}`;
}

async function findDuplicateFile(vehicleNo, workType, excludeId) {
  const query = {
    vehicleNo: exactInsensitive(vehicleNo),
    workType: exactInsensitive(workType),
  };
  if (excludeId) query._id = { $ne: excludeId };
  return File.findOne(query);
}

async function assertFileUnique(vehicleNo, workType, excludeId) {
  if (await findDuplicateFile(vehicleNo, workType, excludeId)) {
    throw ApiError.conflict(
      `A file already exists for vehicle ${vehicleNo} with work type ${workType}`,
      'DUPLICATE_FILE'
    );
  }
}

function pickEditableFields(body) {
  const payload = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  if (payload.documents !== undefined) {
    payload.documents = normalizeDocuments(payload.documents);
  }
  if (payload.requiredDocuments !== undefined) {
    payload.requiredDocuments = normalizeDocuments(payload.requiredDocuments);
  }
  return payload;
}

/** Load WorkType from catalog. Lookup collapses spaces / case. */
async function findWorkTypeOrThrow(workType) {
  const name = normalizeWorkTypeName(workType);
  if (!name) {
    throw ApiError.badRequest('Work type is required');
  }
  const wt = await WorkType.findOne({ name: exactInsensitive(name) });
  if (!wt) {
    throw ApiError.badRequest(
      `Work type "${name}" is not in the catalog. Add it under Work Types first.`
    );
  }
  return wt;
}

/**
 * Resolve required docs from catalog. Always returns canonical workType name
 * so File.workType matches WorkType.name (filters / rename / delete-guard).
 */
async function resolveWorkTypeSnapshot(workType, provided) {
  const wt = await findWorkTypeOrThrow(workType);
  const requiredDocuments =
    Array.isArray(provided) && provided.length
      ? normalizeDocuments(provided)
      : normalizeDocuments(wt.documents || []);
  return { workType: wt.name, requiredDocuments };
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

function computeDashboardStats(files) {
  const pending = files.filter((f) => f.status === 'pending').length;
  const inProcess = files.filter((f) => f.status === 'in_progress').length;

  return {
    totalRecords: files.length,
    pending,
    inProcess,
    // "Live" = files actively in the pipeline (pending + in process).
    live: pending + inProcess,
    completed: files.filter((f) => ['completed', 'done'].includes(f.status)).length,
    objection: files.filter((f) => f.status === 'objection').length,
    returnPaper: files.filter((f) => f.status === 'paper_return').length,
    // Hold sheet = manually marked On Hold only.
    holdSheet: files.filter((f) => isHoldFile(f)).length,
    onHold: files.filter((f) => f.status === 'on_hold').length,
    totalBilling: files.reduce((sum, f) => (f.paymentDone ? sum : sum + (f.totalBill || 0)), 0),
  };
}

/* ------------------------------------------------------------------ */
/* Operations (used by controllers)                                   */
/* ------------------------------------------------------------------ */

async function listFiles(
  user,
  {
    type = 'all_records',
    search = '',
    filterUserId,
    rtoName,
    workType,
    dealerName,
    date,
    dateFrom,
    dateTo,
    datePreset,
  } = {}
) {
  const query = buildListQuery(user, {
    type,
    search,
    filterUserId,
    rtoName,
    workType,
    dealerName,
    date,
    dateFrom,
    dateTo,
    datePreset,
  });
  const files = await File.find(query).sort(FILE_LIST_SORT);
  return { files: files.map((f) => toPublicFile(f, user)), total: files.length };
}

async function paginateFiles(
  user,
  {
    status = 'all_records',
    search = '',
    page = 1,
    pageSize = 10,
    filterUserId,
    rtoName,
    workType,
    dealerName,
    date,
    dateFrom,
    dateTo,
    datePreset,
  } = {}
) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10));
  const query = buildListQuery(user, {
    type: status,
    search,
    filterUserId,
    rtoName,
    workType,
    dealerName,
    date,
    dateFrom,
    dateTo,
    datePreset,
  });

  const [totalCount, rows] = await Promise.all([
    File.countDocuments(query),
    File.find(query)
      .sort(FILE_LIST_SORT)
      .skip((safePage - 1) * safeSize)
      .limit(safeSize),
  ]);

  const totalPages = Math.ceil(totalCount / safeSize) || 0;
  const data = rows.map((f) => toPublicFile(f, user));

  return { data, totalCount, currentPage: safePage, pageSize: safeSize, totalPages };
}

async function listDealerNames(user, filterUserId) {
  const names = await File.distinct('dealerName', buildScopeQuery(user, filterUserId));
  return names
    .map((n) => String(n || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function getFile(user, id) {
  const file = await getAccessibleFile(id, user);
  return toPublicFile(file, user);
}

async function createFile(user, body) {
  const payload = pickEditableFields(body);

  const missing = REQUIRED_CREATE_FIELDS.filter((field) => !payload[field]);
  if (missing.length) {
    throw ApiError.badRequest(`Missing required fields: ${missing.join(', ')}`);
  }

  assertValidFileFields(payload);

  payload.vehicleNo = normalizeVehicleNo(payload.vehicleNo);

  // Persist catalog-canonical work type name (not the raw client/Excel string).
  const snapshot = await resolveWorkTypeSnapshot(payload.workType, payload.requiredDocuments);
  payload.workType = snapshot.workType;
  payload.requiredDocuments = snapshot.requiredDocuments;
  if (payload.documents === undefined) {
    payload.documents = [];
  }

  // Duplicate = same vehicle + same work type (not vehicle alone).
  await assertFileUnique(payload.vehicleNo, payload.workType);

  const createdAt = new Date();
  const file = new File({
    ...payload,
    fileNumber: await nextFileNumber(),
    date: todayDateString(),
    status: 'pending',
    totalBill: 0,
    statusHistory: [{ status: 'pending', at: createdAt, note: 'File created' }],
    createdBy: user._id,
  });

  if (body.fieldAgentId !== undefined) {
    await applyFieldAgentAssignment(file, body.fieldAgentId);
  }

  await file.save();
  return toPublicFile(file, user);
}

async function updateFile(user, id, body) {
  const file = await getAccessibleFile(id, user);

  const payload = pickEditableFields(body);
  assertValidFileFields(payload);

  if (payload.workType !== undefined) {
    const wt = await findWorkTypeOrThrow(payload.workType);
    const prevNorm = normalizeWorkTypeName(file.workType);
    const changed = wt.name !== prevNorm;

    payload.workType = wt.name;
    if (changed && payload.requiredDocuments === undefined) {
      payload.requiredDocuments = normalizeDocuments(wt.documents || []);
    }
  }

  Object.assign(file, payload);

  if (body.vehicleNo !== undefined || body.workType !== undefined) {
    const vehicleNo = normalizeVehicleNo(
      body.vehicleNo !== undefined ? body.vehicleNo : file.vehicleNo
    );
    const workType = body.workType !== undefined ? payload.workType || file.workType : file.workType;
    await assertFileUnique(vehicleNo, workType, file._id);
    file.vehicleNo = vehicleNo;
  }

  // Admin-only: reassign this file to a different user.
  if (body.createdBy !== undefined) {
    file.createdBy = await resolveAssignee(user, body.createdBy);
  }

  // Tracking-only: which district RTO person is handling this file.
  if (body.fieldAgentId !== undefined) {
    await applyFieldAgentAssignment(file, body.fieldAgentId);
  }

  await file.save();
  return toPublicFile(file, user);
}

async function resolveAssignee(actingUser, targetId) {
  if (actingUser.role !== 'superadmin') {
    throw ApiError.forbidden('Only an admin can reassign a file');
  }
  if (!isValidObjectId(targetId)) {
    throw ApiError.badRequest('Invalid user for assignment');
  }
  const targetUser = await User.findById(targetId);
  if (!targetUser || !targetUser.isActive) {
    throw ApiError.badRequest('Assigned user not found or inactive');
  }
  return targetUser._id;
}

/**
 * Set / clear district field agent on a file (tracking label only).
 * Pass null or '' to clear.
 */
async function applyFieldAgentAssignment(file, fieldAgentId) {
  if (fieldAgentId === null || fieldAgentId === '' || fieldAgentId === undefined) {
    file.fieldAgentId = null;
    file.fieldAgentName = '';
    file.fieldAgentMobile = '';
    file.fieldAgentRtoName = '';
    file.fieldAgentDistrict = '';
    return;
  }

  if (!isValidObjectId(fieldAgentId)) {
    throw ApiError.badRequest('Invalid field agent');
  }

  const agent = await FieldAgent.findById(fieldAgentId);
  if (!agent || !agent.isActive) {
    throw ApiError.badRequest('Field agent not found or inactive');
  }

  file.fieldAgentId = agent._id;
  file.fieldAgentName = agent.name;
  file.fieldAgentMobile = agent.mobile || '';
  file.fieldAgentRtoName = agent.rtoName || agent.district || '';
  file.fieldAgentDistrict = '';
}

function getMissingRequiredDocuments(file) {
  const required = Array.isArray(file.requiredDocuments) ? file.requiredDocuments : [];
  if (!required.length) return [];
  const received = new Set(
    (Array.isArray(file.documents) ? file.documents : []).map((d) =>
      String(d || '')
        .trim()
        .toLowerCase()
    )
  );
  return required.filter((doc) => {
    const key = String(doc || '')
      .trim()
      .toLowerCase();
    return key && !received.has(key);
  });
}

async function updateStatus(user, id, { status, remarks } = {}) {
  if (!FILE_STATUSES.includes(status)) {
    throw ApiError.badRequest('Invalid status');
  }
  if (status === 'objection' && (!remarks || !remarks.trim())) {
    throw ApiError.badRequest('Description is required for objection status');
  }

  const file = await getAccessibleFile(id, user);
  const missingDocs = getMissingRequiredDocuments(file);

  // Hold / Paper Return → only In Process allowed.
  if (
    (file.status === 'on_hold' || file.status === 'paper_return') &&
    status !== file.status &&
    status !== 'in_progress'
  ) {
    throw ApiError.badRequest(
      'From Hold or Paper Return you can only move the file to In Process',
      'STATUS_TRANSITION_BLOCKED'
    );
  }

  // Missing required docs: never allow Done; from Pending only Hold / Paper Return.
  if (missingDocs.length && status !== file.status) {
    if (status === 'completed' || status === 'done') {
      throw ApiError.badRequest('DOC IS REQUIRED', 'DOCUMENTS_REQUIRED');
    }
    const docsNotRequiredForStatus = status === 'on_hold' || status === 'paper_return';
    if (file.status === 'pending' && !docsNotRequiredForStatus) {
      throw ApiError.badRequest('DOC IS REQUIRED', 'DOCUMENTS_REQUIRED');
    }
  }

  if (status === 'in_progress' && requiresNewOwner(file.workType)) {
    const hasName = file.ownerName && file.ownerName.trim();
    const hasMob = file.newOwnerMob && file.newOwnerMob.trim();
    if (!hasName || !hasMob) {
      throw ApiError.badRequest(
        'New owner name and mobile number are required before moving this file to In Process.',
        'NEW_OWNER_REQUIRED'
      );
    }
  }

  const previousStatus = file.status;
  file.status = status;
  if (remarks !== undefined) file.remarks = remarks;

  // Append status log when status actually changes (or first history entry).
  if (!Array.isArray(file.statusHistory)) {
    file.statusHistory = [];
  }
  if (file.statusHistory.length === 0 && previousStatus) {
    file.statusHistory.push({
      status: previousStatus,
      at: file.createdAt || new Date(),
      note: 'File created',
    });
  }
  if (previousStatus !== status) {
    let note = '';
    if (status === 'objection' && remarks) {
      note = String(remarks).trim();
    } else if (status === 'completed' || status === 'done') {
      // Show RTO under Done in Status Log (same place as "File created").
      note = String(file.rtoName || '').trim();
    }
    const changedAt = new Date();
    file.statusHistory.push({
      status,
      at: changedAt,
      note,
    });
  }

  await file.save();
  return toPublicFile(file, user);
}

async function updateExpenses(user, id, body) {
  const file = await getAccessibleFile(id, user);

  const expenses = normalizeExpenses(body);
  // Only superadmin may set/change Set Deal — staff saves keep existing value
  if (user.role !== 'superadmin') {
    expenses.setDeal = Number(file.expenses?.setDeal) || 0;
  }

  // Persist every expense line (incl. cngAdjustment / mobNoUpdate) into MongoDB.
  file.set('expenses', expenses);
  file.markModified('expenses');
  file.totalBill = sumExpenses(expenses);
  file.paymentDone = Boolean(body.paymentDone);

  await file.save();
  return toPublicFile(file, user);
}

async function deleteFile(user, id) {
  const file = await getAccessibleFile(id, user);
  await file.deleteOne();
}

const BULK_ACTIONS = new Set(['assign', 'status', 'delete']);
const MAX_BULK_IDS = 100;

async function bulkFiles(user, { ids, action, payload } = {}) {
  if (!BULK_ACTIONS.has(action)) {
    throw ApiError.badRequest('Invalid bulk action');
  }

  const list = Array.isArray(ids)
    ? [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  if (!list.length) throw ApiError.badRequest('Select at least one file');
  if (list.length > MAX_BULK_IDS) {
    throw ApiError.badRequest(`You can update at most ${MAX_BULK_IDS} files at once`);
  }

  if (action === 'assign') {
    if (user.role !== 'superadmin') {
      throw ApiError.forbidden('Only an admin can reassign files');
    }
    await resolveAssignee(user, payload?.userId);
  }

  if (action === 'status') {
    if (!FILE_STATUSES.includes(payload?.status)) {
      throw ApiError.badRequest('Invalid status');
    }
    if (payload.status === 'objection' && !String(payload?.remarks || '').trim()) {
      throw ApiError.badRequest('Description is required for objection status');
    }
  }

  const updated = [];
  const failed = [];

  for (const id of list) {
    try {
      if (action === 'assign') {
        await updateFile(user, id, { createdBy: payload.userId });
      } else if (action === 'status') {
        await updateStatus(user, id, {
          status: payload.status,
          remarks: payload.remarks,
        });
      } else {
        await deleteFile(user, id);
      }
      updated.push(id);
    } catch (err) {
      failed.push({
        id,
        error: err.message || 'Failed',
        code: err.errorCode || undefined,
      });
    }
  }

  return { updated: updated.length, failed };
}

async function getStatsFor(user, filterUserIdOrOpts) {
  // Supports legacy `getStatsFor(user, userIdString)` and
  // `getStatsFor(user, { filterUserId, rtoName, workType, dealerName, search, date })`.
  const opts =
    filterUserIdOrOpts && typeof filterUserIdOrOpts === 'object'
      ? filterUserIdOrOpts
      : { filterUserId: filterUserIdOrOpts };

  const match = buildListQuery(user, {
    type: 'all_records',
    search: opts.search || '',
    filterUserId: opts.filterUserId,
    rtoName: opts.rtoName,
    workType: opts.workType,
    dealerName: opts.dealerName,
    date: opts.date,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    datePreset: opts.datePreset,
  });
  const [byStatus, billing] = await Promise.all([
    File.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    File.aggregate([
      { $match: { $and: [match, { paymentDone: false }] } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totalBill', 0] } } } },
    ]),
  ]);

  const counts = Object.fromEntries(byStatus.map((r) => [r._id, r.count]));
  const pending = counts.pending || 0;
  const inProcess = counts.in_progress || 0;
  const onHold = counts.on_hold || 0;
  const completed = (counts.completed || 0) + (counts.done || 0);
  const objection = counts.objection || 0;
  const returnPaper = counts.paper_return || 0;
  const totalRecords = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return {
    totalRecords,
    pending,
    inProcess,
    live: pending + inProcess,
    completed,
    objection,
    returnPaper,
    holdSheet: onHold,
    onHold,
    totalBilling: billing[0]?.total || 0,
  };
}

module.exports = {
  // domain helpers
  isHoldFile,
  matchesView,
  matchesSearch,
  requiresNewOwner,
  computeDashboardStats,
  canAccess,
  // data helpers
  getScopedFiles,
  findDuplicateFile,
  nextFileNumber,
  // operations
  listFiles,
  paginateFiles,
  listDealerNames,
  getFile,
  createFile,
  updateFile,
  updateStatus,
  updateExpenses,
  deleteFile,
  bulkFiles,
  getStatsFor,
};
