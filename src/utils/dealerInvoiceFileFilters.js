/** Query parsing for invoice wizard: GET /files/by-dealer/:dealerId (single dealer only). */

function firstQueryValue(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function trimOrUndef(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

function normalizeDealerInvoiceFilters(raw = {}) {
  return {
    filterUserId: trimOrUndef(raw.filterUserId),
    rtoName: trimOrUndef(raw.rtoName),
    workType: trimOrUndef(raw.workType),
    search: trimOrUndef(raw.search),
    date: trimOrUndef(raw.date),
    datePreset: trimOrUndef(raw.datePreset),
    dateFrom: trimOrUndef(raw.dateFrom),
    dateTo: trimOrUndef(raw.dateTo),
    minBill: trimOrUndef(raw.minBill),
    maxBill: trimOrUndef(raw.maxBill),
  };
}

function parseTruthyFlag(value) {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function parseDealerInvoiceFiltersFromQuery(query = {}) {
  return {
    ...normalizeDealerInvoiceFilters({
      filterUserId: firstQueryValue(query.userId),
      rtoName: firstQueryValue(query.rtoName),
      workType: firstQueryValue(query.workType),
      search: firstQueryValue(query.search),
      date: firstQueryValue(query.date),
      datePreset: firstQueryValue(query.datePreset),
      dateFrom: firstQueryValue(query.dateFrom),
      dateTo: firstQueryValue(query.dateTo),
      minBill: firstQueryValue(query.minBill),
      maxBill: firstQueryValue(query.maxBill),
    }),
    page: firstQueryValue(query.page),
    pageSize: firstQueryValue(query.pageSize),
    fileIds: trimOrUndef(firstQueryValue(query.fileIds)),
    billableIdsOnly: parseTruthyFlag(query.billableIdsOnly),
  };
}

module.exports = {
  normalizeDealerInvoiceFilters,
  parseDealerInvoiceFiltersFromQuery,
};
