// src/routes/generationRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/generationController');

// Learning Outcomes
router.post('/generate-learning-outcomes', controller.generateLearningOutcomes);
router.post('/generate-code-outcomes', controller.generateCodeOutcomes);

// Base Question Generation
router.post('/generate-practice', controller.handleQuestionGeneration);
router.post('/generate-exam', controller.handleQuestionGeneration);
router.post('/generate-practice-code', controller.handleQuestionGeneration);
router.post('/generate-exam-code', controller.handleQuestionGeneration);

// Variant Generation
router.post('/unit/generate-variants', controller.handleStandardVariantGeneration);
router.post('/unit/generate-code-variants', controller.handleCodeVariantGeneration);

module.exports = router;