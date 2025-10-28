// src/routes/executionRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/executionController');

router.post('/api/execute-code', controller.handleCodeExecution);

module.exports = router;