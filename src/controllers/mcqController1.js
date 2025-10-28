const MCQ = require('../models/mcqModel');

async function saveMCQs(topicName, readingMaterial, generatedMCQs) {
  const doc = new MCQ({ topicName, readingMaterial, mcqs: generatedMCQs });
  return await doc.save();
}

module.exports = { saveMCQs };
