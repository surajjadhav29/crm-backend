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

function yearSuffixPadded(date = new Date()) {
  return String(normalizeDate(date).getFullYear()).slice(-2);
}

/** @deprecated Legacy base without year — e.g. 20 Oct → "2010". */
function dayMonthInvoiceBase(date = new Date()) {
  return `${dayOfMonthPadded(date)}${monthPadded(date)}`;
}

/** Invoice number base: DD + MM + YY, e.g. 20 Oct 2026 → "201026". */
function dayMonthYearInvoiceBase(date = new Date()) {
  return `${dayOfMonthPadded(date)}${monthPadded(date)}${yearSuffixPadded(date)}`;
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

function parseDayMonthYearSuffix(billNumber) {
  const s = String(billNumber || '').trim();
  const withSuffix = /^(\d{6})-(\d+)$/.exec(s);
  if (withSuffix) {
    const base = withSuffix[1];
    const day = parseInt(base.slice(0, 2), 10);
    const month = parseInt(base.slice(2, 4), 10);
    const yy = base.slice(4, 6);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return {
        base,
        dayIndex: parseInt(withSuffix[2], 10),
        dayPart: base.slice(0, 2),
        monthPart: base.slice(2, 4),
        yearPart: yy,
      };
    }
  }
  if (/^\d{6}$/.test(s)) {
    const base = s;
    const day = parseInt(base.slice(0, 2), 10);
    const month = parseInt(base.slice(2, 4), 10);
    const yy = base.slice(4, 6);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return {
        base,
        dayIndex: 1,
        dayPart: base.slice(0, 2),
        monthPart: base.slice(2, 4),
        yearPart: yy,
      };
    }
  }
  return null;
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
        yearPart: null,
      };
    }
  }
  if (/^\d{4}$/.test(s)) {
    const day = parseInt(s.slice(0, 2), 10);
    const month = parseInt(s.slice(2, 4), 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return {
        base: s,
        dayIndex: 1,
        dayPart: s.slice(0, 2),
        monthPart: s.slice(2, 4),
        yearPart: null,
      };
    }
  }
  return null;
}

/** First invoice on a day → DDMMYY; further same day → DDMMYY-2, DDMMYY-3, … */
function formatDealerBillNumber(dayIndex, date = new Date()) {
  const base = dayMonthYearInvoiceBase(date);
  const index = Math.max(1, Number(dayIndex) || 1);
  if (index <= 1) return base;
  return `${base}-${index}`;
}

/**
 * Parse bill numbers — DDMMYY / DDMMYY-N, legacy DDMM / DDMM-N, FY, plain numeric.
 */
function parseDealerBillNumber(billNumber) {
  const s = String(billNumber || '').trim();
  const ddmmyy = parseDayMonthYearSuffix(s);
  if (ddmmyy) {
    return {
      fy: null,
      sequence: ddmmyy.dayIndex,
      day: ddmmyy.dayPart,
      month: ddmmyy.monthPart,
      year: ddmmyy.yearPart,
      base: ddmmyy.base,
    };
  }

  const ddmm = parseDayMonthSuffix(s);
  if (ddmm) {
    return {
      fy: null,
      sequence: ddmm.dayIndex,
      day: ddmm.dayPart,
      month: ddmm.monthPart,
      year: ddmm.yearPart,
      base: ddmm.base,
    };
  }

  const modernFy = /^(\d{2})-(\d+)$/.exec(s);
  if (modernFy) {
    return { fy: modernFy[1], sequence: parseInt(modernFy[2], 10), day: null, month: null, year: null };
  }

  if (/^\d+$/.test(s)) {
    if (s.length >= 3) {
      const dayPart = s.slice(-2);
      const day = parseInt(dayPart, 10);
      const seqPart = s.slice(0, -2);
      if (seqPart.length >= 1 && day >= 1 && day <= 31) {
        return { fy: null, sequence: parseInt(seqPart, 10), day: dayPart, month: null, year: null };
      }
    }
    return { fy: null, sequence: parseInt(s, 10), day: null, month: null, year: null };
  }

  const tail = s.split('-').pop();
  if (tail && /^\d+$/.test(tail)) {
    return parseDealerBillNumber(tail);
  }
  return null;
}

function billNumberRegexForDayMonth() {
  return /^\d{6}(-\d+)?$/;
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
  const base = escapeRegex(dayMonthYearInvoiceBase(date));
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
  dayMonthYearInvoiceBase,
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
  yearSuffixPadded,
  sequenceCounterKey,
  sequenceCounterKeyForFy,
  indianFinancialYearStartYear,
  indianFinancialYearSuffix,
  billNumberRegexForFy,
};
