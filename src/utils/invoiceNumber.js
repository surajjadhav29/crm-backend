const { escapeRegex } = require('./regex');

/** Counter stores how many invoices were issued on a calendar day (seq 1 → first number of the day). */
const DEALER_INVOICE_DAY_COUNTER_PREFIX = 'dealerInvoice:day:';

function normalizeDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function dayOfMonthPadded(date = new Date()) {
  return String(normalizeDate(date).getDate()).padStart(2, '0');
}

function monthPadded(date = new Date()) {
  return String(normalizeDate(date).getMonth() + 1).padStart(2, '0');
}

/** Invoice number base: day + month, e.g. 20 Oct → "2010". */
function dayMonthInvoiceBase(date = new Date()) {
  return `${dayOfMonthPadded(date)}${monthPadded(date)}`;
}

function calendarDateKey(date = new Date()) {
  const d = normalizeDate(date);
  const y = d.getFullYear();
  const m = monthPadded(d);
  const day = dayOfMonthPadded(d);
  return `${y}-${m}-${day}`;
}

function sequenceCounterKeyForDate(date = new Date()) {
  return `${DEALER_INVOICE_DAY_COUNTER_PREFIX}${calendarDateKey(date)}`;
}

/** First invoice on a day → DDMM; further same day → DDMM-2, DDMM-3, … */
function formatDealerBillNumber(dayIndex, date = new Date()) {
  const base = dayMonthInvoiceBase(date);
  const index = Math.max(1, Number(dayIndex) || 1);
  if (index <= 1) return base;
  return `${base}-${index}`;
}

function parseDayMonthSuffix(billNumber) {
  const s = String(billNumber || '').trim();
  const withSuffix = /^(\d{4})-(\d+)$/.exec(s);
  if (withSuffix) {
    const base = withSuffix[1];
    const day = parseInt(base.slice(0, 2), 10);
    const month = parseInt(base.slice(2, 4), 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return {
        base,
        dayIndex: parseInt(withSuffix[2], 10),
        dayPart: base.slice(0, 2),
        monthPart: base.slice(2, 4),
      };
    }
  }
  if (/^\d{4}$/.test(s)) {
    const day = parseInt(s.slice(0, 2), 10);
    const month = parseInt(s.slice(2, 4), 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { base: s, dayIndex: 1, dayPart: s.slice(0, 2), monthPart: s.slice(2, 4) };
    }
  }
  return null;
}

/**
 * Parse bill numbers — DDMM / DDMM-N, legacy serial+day, FY, plain numeric.
 */
function parseDealerBillNumber(billNumber) {
  const s = String(billNumber || '').trim();
  const ddmm = parseDayMonthSuffix(s);
  if (ddmm) {
    return {
      fy: null,
      sequence: ddmm.dayIndex,
      day: ddmm.dayPart,
      month: ddmm.monthPart,
      base: ddmm.base,
    };
  }

  const modernFy = /^(\d{2})-(\d+)$/.exec(s);
  if (modernFy) {
    return { fy: modernFy[1], sequence: parseInt(modernFy[2], 10), day: null, month: null };
  }

  if (/^\d+$/.test(s)) {
    if (s.length >= 3) {
      const dayPart = s.slice(-2);
      const day = parseInt(dayPart, 10);
      const seqPart = s.slice(0, -2);
      if (seqPart.length >= 1 && day >= 1 && day <= 31) {
        return { fy: null, sequence: parseInt(seqPart, 10), day: dayPart, month: null };
      }
    }
    return { fy: null, sequence: parseInt(s, 10), day: null, month: null };
  }

  const tail = s.split('-').pop();
  if (tail && /^\d+$/.test(tail)) {
    return parseDealerBillNumber(tail);
  }
  return null;
}

function billNumberRegexForDayMonth() {
  return /^\d{4}(-\d+)?$/;
}

function startOfLocalDay(date) {
  const d = normalizeDate(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function startOfNextLocalDay(date) {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function billNumberPatternForDate(date) {
  const base = escapeRegex(dayMonthInvoiceBase(date));
  return new RegExp(`^${base}(-\\d+)?$`);
}

/** @deprecated */
function sequenceCounterKey() {
  return `${DEALER_INVOICE_DAY_COUNTER_PREFIX}legacy-serial`;
}

function sequenceCounterKeyForFy(_fySuffix) {
  return sequenceCounterKey();
}

function indianFinancialYearStartYear(date = new Date()) {
  const d = normalizeDate(date);
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

function indianFinancialYearSuffix(date = new Date()) {
  return String(indianFinancialYearStartYear(date)).slice(-2);
}

function billNumberRegexForFy(fySuffix) {
  return new RegExp(`^${escapeRegex(fySuffix)}-\\d+$`);
}

module.exports = {
  dayMonthInvoiceBase,
  calendarDateKey,
  sequenceCounterKeyForDate,
  formatDealerBillNumber,
  parseDealerBillNumber,
  billNumberRegexForDayMonth,
  billNumberPatternForDate,
  startOfLocalDay,
  startOfNextLocalDay,
  dayOfMonthPadded,
  monthPadded,
  sequenceCounterKey,
  sequenceCounterKeyForFy,
  indianFinancialYearStartYear,
  indianFinancialYearSuffix,
  billNumberRegexForFy,
};
