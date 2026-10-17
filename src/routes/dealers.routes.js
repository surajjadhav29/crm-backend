const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const {
  list,
  names,
  getOne,
  listDealerFiles,
  create,
  update,
} = require('../controllers/dealers.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(list));
router.get('/names', asyncHandler(names));
router.get('/:id/files', asyncHandler(listDealerFiles));
router.get('/:id', asyncHandler(getOne));

router.post('/', requireRole('superadmin', 'staff'), asyncHandler(create));
router.put('/:id', requireRole('superadmin', 'staff'), asyncHandler(update));

module.exports = router;
