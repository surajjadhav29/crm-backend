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
  const filterUserId = trimOrUndef(raw.filterUserId) || trimOrUndef(raw.userId);
  return {
    filterUserId,
    rtoName: trimOrUndef(raw.rtoName),
    workType: trimOrUndef(raw.workType),
    status: trimOrUndef(raw.status),
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
      status: firstQueryValue(query.status),
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

/** CSV string or string[] → comma-separated filter value for Mongo layer. */
function joinFilterList(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length ? items.join(',') : undefined;
  }
  return trimOrUndef(value);
}

function parseBodyFlag(value) {
  if (value === true || value === 1) return true;
  return parseTruthyFlag(value);
}

/** POST /dealers/:id/files — filters in JSON body (arrays supported). */
function parseDealerInvoiceFiltersFromBody(body = {}) {
  const userFilter = body.userIds !== undefined ? body.userIds : body.userId;
  const rtoFilter = body.rtoNames !== undefined ? body.rtoNames : body.rtoName;
  const workFilter = body.workTypes !== undefined ? body.workTypes : body.workType;
  const statusFilter = body.statuses !== undefined ? body.statuses : body.status;

  let fileIdsRaw = body.fileIds;
  if (Array.isArray(fileIdsRaw)) {
    fileIdsRaw = fileIdsRaw.map((id) => String(id).trim()).filter(Boolean).join(',');
  }

  return {
    ...normalizeDealerInvoiceFilters({
      filterUserId: joinFilterList(userFilter),
      rtoName: joinFilterList(rtoFilter),
      workType: joinFilterList(workFilter),
      status: joinFilterList(statusFilter),
      search: trimOrUndef(body.search),
      date: trimOrUndef(body.date),
      datePreset: trimOrUndef(body.datePreset),
      dateFrom: trimOrUndef(body.dateFrom),
      dateTo: trimOrUndef(body.dateTo),
      minBill: trimOrUndef(body.minBill),
      maxBill: trimOrUndef(body.maxBill),
    }),
    page: body.page,
    pageSize: body.pageSize,
    fileIds: trimOrUndef(fileIdsRaw),
    billableIdsOnly: parseBodyFlag(body.billableIdsOnly),
  };
}

module.exports = {
  normalizeDealerInvoiceFilters,
  parseDealerInvoiceFiltersFromQuery,
  parseDealerInvoiceFiltersFromBody,
};
