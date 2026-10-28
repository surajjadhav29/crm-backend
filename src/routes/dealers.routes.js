const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const {
  list,
  listBillingPick,
  names,
  getOne,
  listDealerFiles,
  searchDealerFiles,
  markInvoiced,
  listBillingInvoices,
  peekNextBillingInvoiceNumber,
  listDealerBillingInvoices,
  getDealerBillingInvoice,
  createDealerBillingInvoice,
  updateDealerBillingInvoiceReceived,
  reopenDealerBillingInvoiceFiles,
  create,
  update,
  syncLegacyDealerFiles,
} = require('../controllers/dealers.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(list));
router.get('/billing-pick', requireRole('superadmin'), asyncHandler(listBillingPick));
router.get('/names', asyncHandler(names));
router.get(
  '/invoices/next-number',
  requireRole('superadmin'),
  asyncHandler(peekNextBillingInvoiceNumber)
);
router.get(
  '/invoices/tracking',
  requireRole('superadmin'),
  asyncHandler(listBillingInvoices)
);
router.get(
  '/:dealerId/invoices',
  requireRole('superadmin'),
  asyncHandler(listDealerBillingInvoices)
);
router.get(
  '/:dealerId/invoices/:invoiceId',
  requireRole('superadmin'),
  asyncHandler(getDealerBillingInvoice)
);
router.get('/:id/files', asyncHandler(listDealerFiles));
router.post('/:id/files', asyncHandler(searchDealerFiles));
router.get('/:id', asyncHandler(getOne));

router.post(
  '/:dealerId/invoices',
  requireRole('superadmin'),
  asyncHandler(createDealerBillingInvoice)
);
router.patch(
  '/:dealerId/invoices/:invoiceId',
  requireRole('superadmin'),
  asyncHandler(updateDealerBillingInvoiceReceived)
);
router.post(
  '/:dealerId/invoices/:invoiceId/reopen-files',
  requireRole('superadmin'),
  asyncHandler(reopenDealerBillingInvoiceFiles)
);
router.post('/:id/mark-invoiced', requireRole('superadmin'), asyncHandler(markInvoiced));
router.post(
  '/sync-legacy-files',
  requireRole('superadmin'),
  asyncHandler(syncLegacyDealerFiles)
);
router.post('/', requireRole('superadmin', 'staff'), asyncHandler(create));
router.put('/:id', requireRole('superadmin', 'staff'), asyncHandler(update));

module.exports = router;
