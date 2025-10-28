// src/routes/mcqRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/mcqController');

router.get('/topic/:topicId/mcqs', controller.getMcqsForTopic);
router.delete('/unit/mcqs-by-filter', controller.deleteMcqsByFilter);
router.delete('/unit/mcq', controller.deleteMcqById);
router.put('/unit/mcq', controller.updateMcqById); 
module.exports = router;