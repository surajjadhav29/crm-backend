const dealerService = require('../services/dealer.service');
const dealerInvoiceFilesService = require('../services/dealerInvoiceFiles.service');
const dealerInvoiceService = require('../services/dealerInvoice.service');
const { parseDealerInvoiceFiltersFromQuery } = require('../utils/dealerInvoiceFileFilters');

async function list(_req, res) {
  const dealers = await dealerService.listDealers();
  return res.status(200).json({ dealers });
}

async function names(_req, res) {
  const dealers = await dealerService.listDealerNames();
  return res.status(200).json({ dealers });
}

async function getOne(req, res) {
  const dealer = await dealerService.getDealer(req.params.id);
  return res.status(200).json({ dealer });
}

async function listDealerFiles(req, res) {
  const result = await dealerInvoiceFilesService.listFilesForDealerInvoice(
    req.user,
    req.params.id,
    parseDealerInvoiceFiltersFromQuery(req.query)
  );
  return res.status(200).json(result);
}

async function create(req, res) {
  const dealer = await dealerService.createDealer(req.user, req.body);
  return res.status(201).json({ dealer });
}

async function update(req, res) {
  const dealer = await dealerService.updateDealer(req.params.id, req.body);
  return res.status(200).json({ dealer });
}

async function syncLegacyDealerFiles(_req, res) {
  const result = await dealerService.backfillAllLegacyDealerFileLinks();
  return res.status(200).json(result);
}

async function markInvoiced(req, res) {
  const result = await dealerInvoiceFilesService.markDealerFilesInvoiced(
    req.user,
    req.params.id,
    req.body?.fileIds
  );
  return res.status(200).json(result);
}

async function listBillingInvoices(req, res) {
  const invoices = await dealerInvoiceService.listInvoices(req.user, {
    dealerId: req.query.dealerId,
    limit: req.query.limit,
  });
  return res.status(200).json({ invoices });
}

async function peekNextBillingInvoiceNumber(req, res) {
  const billNumber = await dealerInvoiceService.peekNextBillNumber(req.user);
  return res.status(200).json({ billNumber });
}

async function listDealerBillingInvoices(req, res) {
  const invoices = await dealerInvoiceService.listInvoices(req.user, {
    dealerId: req.params.dealerId,
    limit: req.query.limit,
  });
  return res.status(200).json({ invoices });
}

async function getDealerBillingInvoice(req, res) {
  const invoice = await dealerInvoiceService.getInvoice(
    req.user,
    req.params.dealerId,
    req.params.invoiceId
  );
  return res.status(200).json({ invoice });
}

async function createDealerBillingInvoice(req, res) {
  const invoice = await dealerInvoiceService.createInvoice(
    req.user,
    req.params.dealerId,
    req.body
  );
  return res.status(201).json({ invoice });
}

async function updateDealerBillingInvoiceReceived(req, res) {
  const invoice = await dealerInvoiceService.updateInvoiceReceived(
    req.user,
    req.params.dealerId,
    req.params.invoiceId,
    req.body
  );
  return res.status(200).json({ invoice });
}

module.exports = {
  list,
  names,
  getOne,
  listDealerFiles,
  create,
  update,
  syncLegacyDealerFiles,
  markInvoiced,
  listBillingInvoices,
  peekNextBillingInvoiceNumber,
  listDealerBillingInvoices,
  getDealerBillingInvoice,
  createDealerBillingInvoice,
  updateDealerBillingInvoiceReceived,
};
