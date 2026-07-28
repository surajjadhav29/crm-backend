const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const {
  list,
  getOne,
  create,
  update,
  remove,
} = require('../controllers/workTypes.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(list));
router.get('/:id', asyncHandler(getOne));

// Staff + superadmin can manage work types / document checklists
router.post('/', requireRole('superadmin', 'staff'), asyncHandler(create));
router.put('/:id', requireRole('superadmin', 'staff'), asyncHandler(update));
router.delete('/:id', requireRole('superadmin', 'staff'), asyncHandler(remove));

module.exports = router;
