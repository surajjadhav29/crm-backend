const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const {
  list,
  getOne,
  create,
  update,
  updateStatus,
  updateExpenses,
  remove,
} = require('../controllers/files.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(list));
router.post('/', asyncHandler(create));
router.get('/:id', asyncHandler(getOne));
router.put('/:id', asyncHandler(update));
router.put('/:id/status', asyncHandler(updateStatus));
router.put('/:id/expenses', asyncHandler(updateExpenses));
router.delete('/:id', asyncHandler(remove));

module.exports = router;
