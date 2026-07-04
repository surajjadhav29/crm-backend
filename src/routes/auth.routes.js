const express = require('express');
const requireAuth = require('../middleware/auth.middleware');
const asyncHandler = require('../middleware/asyncHandler');
const { login, me } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/login', asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));

module.exports = router;
