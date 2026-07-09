const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const { list, create, update, remove } = require('../controllers/users.controller');

const router = express.Router();

router.use(requireAuth, requireRole('superadmin'));

router.get('/', asyncHandler(list));
router.post('/', asyncHandler(create));
router.put('/:id', asyncHandler(update));
router.delete('/:id', asyncHandler(remove));

module.exports = router;
