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

module.exports = {
  BUSINESS_TIMEZONE,
  todayDateString,
  dateStringDaysAgo,
};
