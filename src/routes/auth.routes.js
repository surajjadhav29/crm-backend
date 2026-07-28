const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const { loginLimiter } = require('../middleware/rateLimit.middleware');
const { login, me } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/login', loginLimiter, asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));

module.exports = router;
