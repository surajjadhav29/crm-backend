const File = require('../models/File');
const Counter = require('../models/Counter');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { exactInsensitive } = require('../utils/regex');
const { isValidObjectId } = require('../utils/objectId');
const {
  FILE_STATUSES,
  EDITABLE_FIELDS,
  REQUIRED_CREATE_FIELDS,
  EXPENSE_FIELDS,
  NEW_OWNER_WORK_TYPES,
  HOLD_DAYS,
  FILE_NUMBER_PREFIX,
  FILE_NUMBER_BASE,
  FILE_NUMBER_COUNTER_ID,
} = require('../constants/file.constants');

/* ------------------------------------------------------------------ */
/* Pure domain helpers (no I/O) — reusable across services            */
/* ------------------------------------------------------------------ */

function isHoldFile(file) {
  if (file.status === 'on_hold') return true;
  if (file.status !== 'pending') return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HOLD_DAYS);
  return new Date(file.date) < cutoff;
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

// Column filters (exact match). Empty/undefined values are ignored so callers
// can pass a partial filter object safely.
function matchesFilters(file, { rtoName, workType, dealerName } = {}) {
  if (rtoName && file.rtoName !== rtoName) return false;
  if (workType && file.workType !== workType) return false;
  if (dealerName && file.dealerName !== dealerName) return false;
  return true;
}

function matchesSearch(file, search) {
  if (!search || !search.trim()) return true;
  const q = search.toLowerCase();
  const fields = [
    file.fileNumber,
    file.ownerName,
    file.oldOwnerName,
    file.vehicleNo,
    file.vehicleModel,
    file.dealerName,
    file.workType,
    file.rtoName,
  ];
  return fields.some((v) => (v || '').toLowerCase().includes(q));
}

function requiresNewOwner(workType) {
  return NEW_OWNER_WORK_TYPES.includes((workType || '').toUpperCase().replace(/\s+/g, ''));
}

// Canonical form for a vehicle number: no spaces, upper-cased. This makes
// "MH 12 AB 1234" and "mh12ab1234" collapse to the same value so uniqueness
// checks (and the DB unique index) actually catch duplicates.
function normalizeVehicleNo(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

const MOBILE_RE = /^\d{10}$/;

// Server-side format validation so direct API calls can't bypass the UI rules.
// Only fields present in `payload` are checked (safe for partial updates).
function assertValidFileFields(payload) {
  const has = (field) => payload[field] !== undefined && payload[field] !== null;

  for (const field of ['chassisNo', 'engineNo']) {
    if (has(field) && String(payload[field]).trim().length !== 5) {
      const label = field === 'chassisNo' ? 'Chassis' : 'Engine';
      throw ApiError.badRequest(`${label} number must be exactly 5 characters`);
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

/* ------------------------------------------------------------------ */
/* Data access helpers                                                 */
/* ------------------------------------------------------------------ */

function buildScopeQuery(user, filterUserId) {
  const query = {};
  if (user.role !== 'superadmin') {
    query.createdBy = user._id;
  } else if (filterUserId) {
    query.createdBy = filterUserId;
  }
  return query;
}

async function getScopedFiles(user, filterUserId) {
  return File.find(buildScopeQuery(user, filterUserId)).sort({ createdAt: -1 });
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

async function findDuplicateVehicle(vehicleNo, excludeId) {
  const query = { vehicleNo: exactInsensitive(vehicleNo) };
  if (excludeId) query._id = { $ne: excludeId };
  return File.findOne(query);
}

async function assertVehicleUnique(vehicleNo, excludeId) {
  if (await findDuplicateVehicle(vehicleNo, excludeId)) {
    throw ApiError.conflict(
      `A file already exists for vehicle number ${vehicleNo}`,
      'DUPLICATE_VEHICLE'
    );
  }
}

function pickEditableFields(body) {
  const payload = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  return payload;
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
    // Hold sheet = manually on hold OR pending for 60+ days.
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
  { type = 'all', search = '', filterUserId, rtoName, workType, dealerName } = {}
) {
  const files = await getScopedFiles(user, filterUserId);
  const filtered = files.filter(
    (f) =>
      matchesView(f, type) &&
      matchesSearch(f, search) &&
      matchesFilters(f, { rtoName, workType, dealerName })
  );
  return { files: filtered.map((f) => f.toJSON()), total: filtered.length };
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
  } = {}
) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10));

  const files = await getScopedFiles(user, filterUserId);
  const filtered = files.filter(
    (f) =>
      matchesView(f, status) &&
      matchesSearch(f, search) &&
      matchesFilters(f, { rtoName, workType, dealerName })
  );

  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / safeSize) || 0;
  const start = (safePage - 1) * safeSize;
  const data = filtered.slice(start, start + safeSize).map((f) => f.toJSON());

  return { data, totalCount, currentPage: safePage, pageSize: safeSize, totalPages };
}

async function getFile(user, id) {
  const file = await getAccessibleFile(id, user);
  return file.toJSON();
}

async function createFile(user, body) {
  const payload = pickEditableFields(body);

  const missing = REQUIRED_CREATE_FIELDS.filter((field) => !payload[field]);
  if (missing.length) {
    throw ApiError.badRequest(`Missing required fields: ${missing.join(', ')}`);
  }

  assertValidFileFields(payload);

  payload.vehicleNo = normalizeVehicleNo(payload.vehicleNo);
  await assertVehicleUnique(payload.vehicleNo);

  const file = await File.create({
    ...payload,
    fileNumber: await nextFileNumber(),
    date: new Date().toISOString().split('T')[0],
    status: 'pending',
    totalBill: 0,
    createdBy: user._id,
  });

  return file.toJSON();
}

async function updateFile(user, id, body) {
  const file = await getAccessibleFile(id, user);

  const payload = pickEditableFields(body);
  assertValidFileFields(payload);
  Object.assign(file, payload);

  if (body.vehicleNo !== undefined) {
    const vehicleNo = normalizeVehicleNo(body.vehicleNo);
    await assertVehicleUnique(vehicleNo, file._id);
    file.vehicleNo = vehicleNo;
  }

  // Admin-only: reassign this file to a different user.
  if (body.createdBy !== undefined) {
    file.createdBy = await resolveAssignee(user, body.createdBy);
  }

  await file.save();
  return file.toJSON();
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

async function updateStatus(user, id, { status, remarks } = {}) {
  if (!FILE_STATUSES.includes(status)) {
    throw ApiError.badRequest('Invalid status');
  }
  if (status === 'objection' && (!remarks || !remarks.trim())) {
    throw ApiError.badRequest('Description is required for objection status');
  }

  const file = await getAccessibleFile(id, user);

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

  file.status = status;
  if (remarks !== undefined) file.remarks = remarks;
  await file.save();
  return file.toJSON();
}

async function updateExpenses(user, id, body) {
  const file = await getAccessibleFile(id, user);

  const expenses = normalizeExpenses(body);
  file.expenses = expenses;
  file.totalBill = sumExpenses(expenses);
  file.paymentDone = Boolean(body.paymentDone);

  await file.save();
  return file.toJSON();
}

async function deleteFile(user, id) {
  const file = await getAccessibleFile(id, user);
  await file.deleteOne();
}

async function getStatsFor(user, filterUserId) {
  const files = await getScopedFiles(user, filterUserId);
  return computeDashboardStats(files);
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
  findDuplicateVehicle,
  nextFileNumber,
  // operations
  listFiles,
  paginateFiles,
  getFile,
  createFile,
  updateFile,
  updateStatus,
  updateExpenses,
  deleteFile,
  getStatsFor,
};
