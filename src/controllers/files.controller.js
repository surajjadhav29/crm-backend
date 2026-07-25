const fileService = require('../services/file.service');
const fileExcelService = require('../services/fileExcel.service');
const ApiError = require('../utils/apiError');

async function list(req, res) {
  const result = await fileService.listFiles(req.user, {
    type: req.query.type,
    search: req.query.search,
    filterUserId: req.query.userId,
    rtoName: req.query.rtoName,
    workType: req.query.workType,
    dealerName: req.query.dealerName,
  });
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

async function updateExpenses(req, res) {
  const file = await fileService.updateExpenses(req.user, req.params.id, req.body);
  return res.status(200).json({ success: true, file });
}

async function remove(req, res) {
  await fileService.deleteFile(req.user, req.params.id);
  return res.status(200).json({ success: true });
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
  paginatedList,
  getOne,
  create,
  update,
  updateStatus,
  updateExpenses,
  remove,
  downloadExcelTemplate,
  uploadExcel,
};
