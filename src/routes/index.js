// src/routes/index.js
const express = require('express');
const router = express.Router();

const structureRoutes = require('./structureRoutes');
const mcqRoutes = require('./mcqRoutes');
const generationRoutes = require('./generationRoutes');
const executionRoutes = require('./executionRoutes');

router.use(structureRoutes);
router.use(mcqRoutes);
router.use(generationRoutes);
router.use(executionRoutes);

module.exports = router;