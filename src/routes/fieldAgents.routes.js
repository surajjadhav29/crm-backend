const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const {
  list,
  getOne,
  create,
  update,
  updateOffice,
  remove,
  removeOffice,
} = require('../controllers/fieldAgents.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(list));

// Office staff manage the agent directory (agents themselves never log in).
// /office routes must be registered before /:id.
router.put('/office', requireRole('superadmin', 'staff'), asyncHandler(updateOffice));
router.delete('/office', requireRole('superadmin', 'staff'), asyncHandler(removeOffice));

router.get('/:id', asyncHandler(getOne));
router.post('/', requireRole('superadmin', 'staff'), asyncHandler(create));
router.put('/:id', requireRole('superadmin', 'staff'), asyncHandler(update));
router.delete('/:id', requireRole('superadmin', 'staff'), asyncHandler(remove));

module.exports = router;
