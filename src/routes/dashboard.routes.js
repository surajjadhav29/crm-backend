const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const { stats } = require('../controllers/files.controller');

const router = express.Router();

router.get('/stats', requireAuth, asyncHandler(stats));

module.exports = router;
