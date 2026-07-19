const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const { list, create } = require('../controllers/rtos.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(list));
router.post('/', asyncHandler(create));

module.exports = router;
