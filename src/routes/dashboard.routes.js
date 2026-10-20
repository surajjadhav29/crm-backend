const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const { stats, analytics, lists } = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/stats', requireAuth, asyncHandler(stats));
router.get('/analytics', requireAuth, asyncHandler(analytics));
router.get('/lists', requireAuth, asyncHandler(lists));

module.exports = router;
