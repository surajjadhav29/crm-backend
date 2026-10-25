/** Business timezone for calendar dates (file.date, hold cutoff, etc.). */
const BUSINESS_TIMEZONE = 'Asia/Kolkata';

/** IST has no DST — fixed +05:30 for calendar-day ↔ UTC Date bounds. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Today's calendar date in the business timezone as YYYY-MM-DD.
 * Avoids UTC drift near midnight (e.g. 2am IST was saving the previous day).
 */
function todayDateString(timeZone = BUSINESS_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Calendar date N days before today (business TZ), as YYYY-MM-DD.
 * Safe for lexicographic compare against `file.date` strings.
 */
function dateStringDaysAgo(days, timeZone = BUSINESS_TIMEZONE) {
  const today = todayDateString(timeZone);
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

const DATE_FILTER_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PRESETS = new Set(['hour', 'today', 'yesterday', '30d']);

/** Accept only YYYY-MM-DD for list/stats filters. Empty or invalid → ignored. */
function normalizeDateFilter(value) {
  const day = String(value || '').trim().slice(0, 10);
  return DATE_FILTER_RE.test(day) ? day : '';
}

function normalizeDatePreset(value) {
  const key = String(value || '').trim();
  return DATE_PRESETS.has(key) ? key : '';
}

/**
 * `created` (default) → file.date / createdAt (existing behaviour).
 * `status` → when the file entered its current status (lastStatusAt).
 */
function normalizeDateBasis(value) {
  return String(value || '').trim().toLowerCase() === 'status' ? 'status' : 'created';
}

function addCalendarDays(day, days) {
  const [y, m, d] = String(day).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

/** Instant of 00:00:00.000 Asia/Kolkata on the given YYYY-MM-DD. */
function calendarDayStartUtc(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/**
 * Inclusive calendar range on a Date field (IST days).
 * Returns { $gte, $lt } (end exclusive = start of day after `to`).
 */
function buildInstantRangeForCalendarDays(dateFrom, dateTo) {
  let from = normalizeDateFilter(dateFrom);
  let to = normalizeDateFilter(dateTo);
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  // Custom range requires both ends (same rule as File Records / Billing UI).
  if (!from || !to) return null;
  return {
    $gte: calendarDayStartUtc(from),
    $lt: calendarDayStartUtc(addCalendarDays(to, 1)),
  };
}

function buildDateRangeClause(dateFrom, dateTo) {
  let from = normalizeDateFilter(dateFrom);
  let to = normalizeDateFilter(dateTo);
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  // Custom range requires both Start and End — one-sided From/Until ignored.
  if (!from || !to) return null;
  return { date: { $gte: from, $lte: to } };
}

/**
 * Current-status entry time: prefer lastStatusAt; fall back to createdAt when
 * lastStatusAt is missing (legacy rows).
 */
function buildLastStatusAtClause(instantRange) {
  if (!instantRange || !Object.keys(instantRange).length) return null;
  return {
    $or: [
      { lastStatusAt: instantRange },
      {
        $and: [
          {
            $or: [{ lastStatusAt: null }, { lastStatusAt: { $exists: false } }],
          },
          { createdAt: instantRange },
        ],
      },
    ],
  };
}

/** Mongo query for “entered current status” presets / custom range. */
function buildStatusDateFilterQuery({ date, datePreset, dateFrom, dateTo } = {}) {
  const range = buildInstantRangeForCalendarDays(dateFrom, dateTo);
  if (range) return buildLastStatusAtClause(range);

  const preset = normalizeDatePreset(datePreset);
  if (preset === 'hour') {
    return buildLastStatusAtClause({ $gte: new Date(Date.now() - 60 * 60 * 1000) });
  }
  if (preset === 'today') {
    return buildLastStatusAtClause(buildInstantRangeForCalendarDays(todayDateString(), todayDateString()));
  }
  if (preset === 'yesterday') {
    const day = dateStringDaysAgo(1);
    return buildLastStatusAtClause(buildInstantRangeForCalendarDays(day, day));
  }
  if (preset === '30d') {
    return buildLastStatusAtClause(
      buildInstantRangeForCalendarDays(dateStringDaysAgo(29), todayDateString())
    );
  }
  const day = normalizeDateFilter(date);
  if (!day) return null;
  return buildLastStatusAtClause(buildInstantRangeForCalendarDays(day, day));
}

/** Mongo query fragment for Created date presets / a custom calendar range. */
function buildCreatedDateFilterQuery({ date, datePreset, dateFrom, dateTo } = {}) {
  const rangeQuery = buildDateRangeClause(dateFrom, dateTo);
  if (rangeQuery) return rangeQuery;

  const preset = normalizeDatePreset(datePreset);
  if (preset === 'hour') {
    return { createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } };
  }
  if (preset === 'today') {
    return { date: todayDateString() };
  }
  if (preset === 'yesterday') {
    return { date: dateStringDaysAgo(1) };
  }
  if (preset === '30d') {
    return { date: { $gte: dateStringDaysAgo(29), $lte: todayDateString() } };
  }
  const day = normalizeDateFilter(date);
  return day ? { date: day } : null;
}

/**
 * Date filter for File Records list/stats.
 * Default `dateBasis` = created (unchanged). Pass `status` for lastStatusAt.
 * Billing / other callers that omit dateBasis keep created behaviour.
 */
function buildDateFilterQuery({ date, datePreset, dateFrom, dateTo, dateBasis } = {}) {
  if (normalizeDateBasis(dateBasis) === 'status') {
    return buildStatusDateFilterQuery({ date, datePreset, dateFrom, dateTo });
  }
  return buildCreatedDateFilterQuery({ date, datePreset, dateFrom, dateTo });
}

/** Custom created-date range (file.date YYYY-MM-DD) — used by dealer invoice filters. */
function buildDateRangeFilterQuery({ dateFrom, dateTo } = {}) {
  return buildDateRangeClause(dateFrom, dateTo);
}

function instantInRange(value, range) {
  if (!range) return true;
  const t = value ? new Date(value) : null;
  if (!t || Number.isNaN(t.getTime())) return false;
  if (range.$gte && t < range.$gte) return false;
  if (range.$lt && !(t < range.$lt)) return false;
  if (range.$lte && t > range.$lte) return false;
  return true;
}

function matchesStatusDateFilter(file, { date, datePreset, dateFrom, dateTo } = {}) {
  const query = buildStatusDateFilterQuery({ date, datePreset, dateFrom, dateTo });
  if (!query) return true;
  const at = file.lastStatusAt || file.createdAt;
  if (query.$or) {
    // Same semantics as buildLastStatusAtClause: use lastStatusAt when set, else createdAt.
    if (file.lastStatusAt) {
      const branch = query.$or.find((part) => part.lastStatusAt);
      return instantInRange(file.lastStatusAt, branch?.lastStatusAt);
    }
    const fallback = query.$or.find((part) => part.$and)?.$and?.find((p) => p.createdAt);
    return instantInRange(file.createdAt, fallback?.createdAt);
  }
  if (query.lastStatusAt) return instantInRange(at, query.lastStatusAt);
  return true;
}

function matchesDateFilter(file, { date, datePreset, dateFrom, dateTo, dateBasis } = {}) {
  if (normalizeDateBasis(dateBasis) === 'status') {
    return matchesStatusDateFilter(file, { date, datePreset, dateFrom, dateTo });
  }
  const query = buildCreatedDateFilterQuery({ date, datePreset, dateFrom, dateTo });
  if (!query) return true;
  if (query.createdAt?.$gte) {
    const created = file.createdAt ? new Date(file.createdAt) : null;
    return Boolean(created && created >= query.createdAt.$gte);
  }
  if (query.date && typeof query.date === 'object') {
    const day = String(file.date || '').slice(0, 10);
    if (query.date.$gte && day < query.date.$gte) return false;
    if (query.date.$lte && day > query.date.$lte) return false;
    return Boolean(day);
  }
  if (query.date) {
    return String(file.date || '').slice(0, 10) === query.date;
  }
  return true;
}

module.exports = {
  BUSINESS_TIMEZONE,
  todayDateString,
  dateStringDaysAgo,
  normalizeDateFilter,
  normalizeDatePreset,
  normalizeDateBasis,
  buildDateFilterQuery,
  buildDateRangeFilterQuery,
  matchesDateFilter,
};
