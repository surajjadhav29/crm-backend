const fileService = require('../services/file.service');

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

module.exports = {
  list,
  paginatedList,
  getOne,
  create,
  update,
  updateStatus,
  updateExpenses,
  remove,
};
