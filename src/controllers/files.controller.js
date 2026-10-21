const fileService = require('../services/file.service');
const fileExcelService = require('../services/fileExcel.service');
const dealerInvoiceFilesService = require('../services/dealerInvoiceFiles.service');
const ApiError = require('../utils/apiError');
const { parseDealerInvoiceFiltersFromQuery } = require('../utils/dealerInvoiceFileFilters');

async function list(req, res) {
  const result = await fileService.listFiles(req.user, {
    type: req.query.type,
    search: req.query.search,
    filterUserId: req.query.userId,
    rtoName: req.query.rtoName,
    workType: req.query.workType,
    dealerName: req.query.dealerName,
    date: req.query.date,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    datePreset: req.query.datePreset,
  });
  return res.status(200).json(result);
}

async function dealerNames(req, res) {
  const dealers = await fileService.listDealerNames(req.user, req.query.userId);
  return res.status(200).json({ dealers });
}

/** Invoice wizard: one dealer + optional AND filters (RTO, bill, etc.). */
async function listByDealer(req, res) {
  const result = await dealerInvoiceFilesService.listFilesForDealerInvoice(
    req.user,
    req.params.dealerId,
    parseDealerInvoiceFiltersFromQuery(req.query)
  );
  return res.status(200).json(result);
}

async function paginatedList(req, res) {
  const result = await fileService.paginateFiles(req.user, {
    status: req.query.status,
    search: req.query.search,
    page: req.query.page,
    pageSize: req.query.pageSize,
    filterUserId: req.query.userId,
    rtoName: req.query.rtoName,
    workType: req.query.workType,
    dealerName: req.query.dealerName,
    date: req.query.date,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    datePreset: req.query.datePreset,
  });
  return res.status(200).json(result);
}

async function getOne(req, res) {
  const file = await fileService.getFile(req.user, req.params.id);
  return res.status(200).json({ file });
}

async function create(req, res) {
  const file = await fileService.createFile(req.user, req.body);
  return res.status(201).json({ success: true, file });
}

async function update(req, res) {
  const file = await fileService.updateFile(req.user, req.params.id, req.body);
  return res.status(200).json({ success: true, file });
}

async function updateStatus(req, res) {
  const file = await fileService.updateStatus(req.user, req.params.id, {
    status: req.body.status,
    remarks: req.body.remarks,
  });
  return res.status(200).json({ success: true, file });
}

async function addObjectionReview(req, res) {
  const file = await fileService.addObjectionReview(req.user, req.params.id, {
    reason: req.body.reason,
  });
  return res.status(200).json({ success: true, file });
}

async function updateExpenses(req, res) {
  const file = await fileService.updateExpenses(req.user, req.params.id, req.body);
  return res.status(200).json({ success: true, file });
}

async function remove(req, res) {
  await fileService.deleteFile(req.user, req.params.id);
  return res.status(200).json({ success: true });
}

async function bulk(req, res) {
  const result = await fileService.bulkFiles(req.user, {
    ids: req.body.ids,
    action: req.body.action,
    payload: req.body.payload,
  });
  return res.status(200).json({ success: true, ...result });
}

async function downloadExcelTemplate(_req, res) {
  const buffer = await fileExcelService.buildExcelTemplateBuffer();
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="AutoAxis_File_Upload_Template.xlsx"'
  );
  res.setHeader('Content-Length', body.length);
  return res.status(200).send(body);
}

async function uploadExcel(req, res) {
  if (!req.file) {
    throw ApiError.badRequest('Excel file is required (.xlsx)');
  }
  if (!req.file.buffer || !req.file.buffer.length) {
    throw ApiError.badRequest('Uploaded Excel file is empty');
  }
  const name = (req.file.originalname || '').toLowerCase();
  if (!name.endsWith('.xlsx')) {
    throw ApiError.badRequest('Only .xlsx Excel files are allowed');
  }

  const result = await fileExcelService.importFilesFromExcel(req.user, req.file.buffer);
  return res.status(200).json({ success: true, ...result });
}

module.exports = {
  list,
  dealerNames,
  listByDealer,
  paginatedList,
  getOne,
  create,
  update,
  updateStatus,
  addObjectionReview,
  updateExpenses,
  remove,
  bulk,
  downloadExcelTemplate,
  uploadExcel,
};
