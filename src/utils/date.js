/** Business timezone for calendar dates (file.date, hold cutoff, etc.). */
const BUSINESS_TIMEZONE = 'Asia/Kolkata';

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

/** Mongo query fragment for Created date presets / a custom calendar range. */
function buildDateFilterQuery({ date, datePreset, dateFrom, dateTo } = {}) {
  let from = normalizeDateFilter(dateFrom);
  let to = normalizeDateFilter(dateTo);
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  if (from || to) {
    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    return { date: range };
  }

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

function matchesDateFilter(file, { date, datePreset, dateFrom, dateTo } = {}) {
  const query = buildDateFilterQuery({ date, datePreset, dateFrom, dateTo });
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
  buildDateFilterQuery,
  matchesDateFilter,
};
