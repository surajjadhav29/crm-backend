/**
 * Overdue objection rules — keep in sync with FE src/lib/objectionReminder.ts
 * Overdue = in Objection for 3+ calendar days (not 72-hour math).
 */
const OBJECTION_REMINDER_DAYS = 3;

function toValidDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalCalendarDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Start of the current Objection stint (when status last became Objection).
 */
function getObjectionSince(file) {
  if (String(file?.status || '').toLowerCase() !== 'objection') return null;

  const history = Array.isArray(file.statusHistory) ? file.statusHistory : [];
  if (history.length) {
    let stintStart = null;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i];
      if (String(entry?.status || '').toLowerCase() !== 'objection') break;
      const at = toValidDate(entry.at);
      if (at) stintStart = at;
    }
    if (stintStart) return stintStart;
  }

  for (const field of ['lastStatusAt', 'updatedAt', 'createdAt']) {
    const at = toValidDate(file[field]);
    if (at) return at;
  }
  return null;
}

function getObjectionPendingCalendarDays(file, now = new Date()) {
  const since = getObjectionSince(file);
  if (!since) return null;
  const sinceDay = startOfLocalCalendarDay(since);
  const nowDay = startOfLocalCalendarDay(now);
  const diff = Math.floor((nowDay.getTime() - sinceDay.getTime()) / 86400000);
  return diff < 0 ? 0 : diff;
}

function isObjectionOverdue(file, now = new Date()) {
  if (String(file?.status || '').toLowerCase() !== 'objection') return false;
  const days = getObjectionPendingCalendarDays(file, now);
  return days != null && days >= OBJECTION_REMINDER_DAYS;
}

function sortOverdueObjections(files, now = new Date()) {
  return [...files].sort((a, b) => {
    const aDays = getObjectionPendingCalendarDays(a, now) ?? 0;
    const bDays = getObjectionPendingCalendarDays(b, now) ?? 0;
    if (bDays !== aDays) return bDays - aDays;
    const aSince = getObjectionSince(a)?.getTime() ?? 0;
    const bSince = getObjectionSince(b)?.getTime() ?? 0;
    return aSince - bSince;
  });
}

module.exports = {
  OBJECTION_REMINDER_DAYS,
  getObjectionSince,
  getObjectionPendingCalendarDays,
  isObjectionOverdue,
  sortOverdueObjections,
};
