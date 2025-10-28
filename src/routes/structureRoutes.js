// src/routes/structureRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/structureController');

// Subject routes
router.get('/subjects', controller.getAllSubjects);
router.post('/subjects', controller.createSubject);
router.delete('/subjects/:subjectName', controller.deleteSubjectByName);
router.delete('/subject/:subjectId', controller.deleteSubjectById);

// Topic routes
router.get('/subjects/:subjectName/topics', controller.getTopicsForSubject);
router.post('/topics', controller.createTopic);
router.delete('/topics/:topicId', controller.deleteTopicById);
router.delete('/topic', controller.deleteTopicByNames);

// Unit routes
router.get('/unit', controller.getUnitData);
router.post('/units', controller.createUnit);
router.delete('/unit', controller.deleteUnitByNames);

module.exports = router;