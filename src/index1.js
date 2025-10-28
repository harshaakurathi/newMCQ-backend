const { generateMCQs } = require('./services/mcqService');
const { saveMCQs } = require('./controllers/mcqController');

async function run(text, topicName) {
  const mcqs = generateMCQs(text, topicName);
  const saved = await saveMCQs(topicName, text, mcqs);
  console.log('Saved MCQs:', saved._id);
}

// Example usage
run("## Integration Testing\nIntegration testing ensures modules work together...", "Integration Testing");
