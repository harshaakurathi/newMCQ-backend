require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Subject = require('../models/mcqModel'); // UPDATED: Use the new model name

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected successfully.'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- Helper Functions ---
function generateUUID() { return crypto.randomUUID(); }
function normalizeConcept(concept) {
    if (!concept) return 'general';
    const parts = concept.toString().toLowerCase().trim().split(/\s+/);
    return parts.slice(0, 2).join('-');
}
const getTopicPrefix = (topicName) => {
    const words = topicName.split(' ');
    if (words.length > 1) {
        return words.map(word => word[0]).join('').toUpperCase();
    }
    return topicName.substring(0, 3).toUpperCase();
};


// --- REBUILT API ENDPOINTS FOR NEW SCHEMA ---

// Fetches all subjects, topics, and units (names only for UI selectors)
app.get('/subjects', async (req, res) => {
    console.log('🚀 GET /subjects - Fetching all subjects...');
    try {
        const subjects = await Subject.find({}, 'subject_name topics.topic_name topics.units.unit_name');
        console.log(`✅ GET /subjects - Successfully fetched ${subjects.length} subjects.`);
        res.status(200).json(subjects);
    } catch (err) {
        console.error('❌ GET /subjects - Error:', err.message);
        res.status(500).json({ error: "Failed to fetch subjects.", details: err.message });
    }
});

// Fetches all topics for a specific subject
app.get('/subjects/:subjectName/topics', async (req, res) => {
    const { subjectName } = req.params;
    console.log(`🚀 GET /subjects/${subjectName}/topics - Fetching topics...`);

    try {
        // Find the subject and return only its topics array
        const subject = await Subject.findOne(
            { subject_name: subjectName },
            { 'topics': 1, '_id': 0 } // Projection: only return the topics field
        );

        if (!subject || !subject.topics) {
            console.warn(`⚠️ GET /subjects/.../topics - Subject not found or has no topics: ${subjectName}`);
            return res.status(404).json({ error: 'Subject not found or it contains no topics.' });
        }

        console.log(`✅ GET /subjects/.../topics - Successfully fetched ${subject.topics.length} topics.`);
        res.status(200).json(subject.topics); // Return the array of topics

    } catch (err) {
        console.error('❌ GET /subjects/.../topics - Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch topics.', details: err.message });
    }
});

// Fetches the full data for a specific unit
app.get('/unit', async (req, res) => {
    const { subjectName, topicName, unitName } = req.query;
    if (!subjectName || !topicName || !unitName) {
        return res.status(400).json({ error: 'subjectName, topicName, and unitName are required query parameters.' });
    }
    console.log(`🚀 GET /unit - Fetching data for: ${subjectName}/${topicName}/${unitName}`);
    try {
        const subject = await Subject.findOne(
            { 'subject_name': subjectName, 'topics.topic_name': topicName },
            { 'topics.$': 1 } // Project only the matching topic
        );

        if (!subject || !subject.topics || subject.topics.length === 0) {
            return res.status(404).json({ error: 'Topic not found within the specified subject.' });
        }
        const unit = subject.topics[0].units.find(u => u.unit_name === unitName);
        if (!unit) {
            return res.status(404).json({ error: 'Unit not found within the specified topic.' });
        }
        console.log(`✅ GET /unit - Successfully fetched unit data.`);
        res.status(200).json(unit);
    } catch (err) {
        console.error('❌ GET /unit - Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch unit data.', details: err.message });
    }
});


app.get('/topic/:topicId/mcqs', async (req, res) => {
    try {
        const { topicId } = req.params;
        const subject = await Subject.findOne({ "topics._id": topicId }, { "topics.$": 1 });
        if (!subject || !subject.topics.length) {
            return res.status(404).json({ error: 'Topic not found' });
        }
        const topic = subject.topics[0];
        const allMcqs = topic.units.reduce((acc, unit) => acc.concat(unit.mcqs), []);
        res.status(200).json({ mcqs: allMcqs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve MCQs for the topic.', details: err.message });
    }
});


// Create a new empty Subject
app.post('/subjects', async (req, res) => {
    const { subject_name } = req.body;
    if (!subject_name) {
        return res.status(400).json({ error: 'subject_name is required.' });
    }
    console.log(`🚀 POST /subjects - Creating new subject: ${subject_name}`);
    try {
        const existingSubject = await Subject.findOne({ subject_name });
        if (existingSubject) {
            return res.status(409).json({ error: 'A subject with this name already exists.' });
        }
        const newSubject = new Subject({ subject_name, topics: [] });
        await newSubject.save();
        console.log(`✅ POST /subjects - Successfully created subject.`);
        res.status(201).json(newSubject);
    } catch (err) {
        console.error('❌ POST /subjects - Error:', err.message);
        res.status(500).json({ error: 'Failed to create subject.', details: err.message });
    }
});

// Create a new empty Topic within a Subject
app.post('/topics', async (req, res) => {
    const { subjectName, topic_name } = req.body;
    if (!subjectName || !topic_name) {
        return res.status(400).json({ error: 'subjectName and topic_name are required.' });
    }
    console.log(`🚀 POST /topics - Creating new topic: ${topic_name} in ${subjectName}`);
    try {
        const subject = await Subject.findOne({ subject_name: subjectName });
        if (!subject) {
            return res.status(404).json({ error: 'Subject not found.' });
        }
        if (subject.topics.some(t => t.topic_name === topic_name)) {
            return res.status(409).json({ error: 'A topic with this name already exists in this subject.' });
        }
        subject.topics.push({ topic_name, units: [] });
        await subject.save();
        console.log(`✅ POST /topics - Successfully created topic.`);
        res.status(201).json(subject);
    } catch (err) {
        console.error('❌ POST /topics - Error:', err.message);
        res.status(500).json({ error: 'Failed to create topic.', details: err.message });
    }
});



// [NEW] DELETE a subject by name
app.delete('/subjects/:subjectName', async (req, res) => {
    try {
        const subjectName = decodeURIComponent(req.params.subjectName);
        const result = await Subject.deleteOne({ subject_name: subjectName });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        res.status(200).json({ message: 'Subject deleted successfully' });
    } catch (error) {
        console.error("Error deleting subject:", error);
        res.status(500).json({ error: 'Failed to delete subject' });
    }
});

// DELETE a topic by ID
app.delete('/topics/:topicId', async (req, res) => {
    try {
        const { topicId } = req.params;
        const subject = await Subject.findOne({ "topics._id": topicId });
        if (!subject) {
            return res.status(404).json({ error: 'Topic not found' });
        }
        
        // Use the pull method to remove the subdocument
        subject.topics.pull({ _id: topicId });
        await subject.save();
        
        res.status(200).json({ message: 'Topic deleted successfully' });
    } catch (error) {
        console.error("Error deleting topic:", error);
        res.status(500).json({ error: 'Failed to delete topic' });
    }
});

// Create a new empty Unit within a Topic
app.post('/units', async (req, res) => {
    const { subjectName, topicName, unit_name } = req.body;
    if (!subjectName || !topicName || !unit_name) {
        return res.status(400).json({ error: 'subjectName, topicName, and unit_name are required.' });
    }
    console.log(`🚀 POST /units - Creating new unit: ${unit_name} in ${topicName}`);
    try {
        const subject = await Subject.findOne({ 'subject_name': subjectName });
        if (!subject) return res.status(404).json({ error: 'Subject not found.' });

        const topic = subject.topics.find(t => t.topic_name === topicName);
        if (!topic) return res.status(404).json({ error: 'Topic not found.' });

        if (topic.units.some(u => u.unit_name === unit_name)) {
            return res.status(409).json({ error: 'A unit with this name already exists in this topic.' });
        }

        // Create a new unit with empty reading material
        topic.units.push({ unit_name, readingMaterial: '', mcqs: [], learningOutcomes: [] });
        await subject.save();
        console.log(`✅ POST /units - Successfully created unit.`);
        res.status(201).json(subject);
    } catch (err) {
        console.error('❌ POST /units - Error:', err.message);
        res.status(500).json({ error: 'Failed to create unit.', details: err.message });
    }
});

// Delete a batch of MCQs from a unit based on a filter
app.delete('/unit/mcqs-by-filter', async (req, res) => {
    const { subjectName, topicName, unitName, filter } = req.body;
    console.log(`🚀 DELETE /unit/mcqs-by-filter - Deleting '${filter}' MCQs from ${unitName}`);

    try {
        const subject = await Subject.findOne({ subject_name: subjectName });
        if (!subject) return res.status(404).json({ error: 'Subject not found.' });

        const topic = subject.topics.find(t => t.topic_name === topicName);
        if (!topic) return res.status(404).json({ error: 'Topic not found.' });

        const unit = topic.units.find(u => u.unit_name === unitName);
        if (!unit) return res.status(404).json({ error: 'Unit not found.' });

        // This logic mirrors the frontend filter. We determine which MCQs to KEEP.
        const mcqsToKeep = unit.mcqs.filter(mcq => {
            switch (filter) {
                // Combined Views (Keep if NOT matching)
                case 'practice-base-all':
                    return !(mcq.mode === 'practice' && mcq.is_base);
                case 'practice-variants-all':
                    return !(mcq.mode === 'practice' && !mcq.is_base);
                case 'practice-all':
                    return !(mcq.mode === 'practice');
                case 'exam': // This filter means "Exam - All Base" in your frontend dropdown
                    return !(mcq.mode === 'exam' && mcq.is_base); // Keep if NOT exam base

                // Individual Filters (Keep if NOT matching)
                case 'practice-base':
                    return !(mcq.mode === 'practice' && mcq.is_base && !mcq.isCode);
                case 'practice-variants':
                    return !(mcq.mode === 'practice' && !mcq.is_base && !mcq.isCode);
                case 'code-base':
                    return !(mcq.mode === 'practice' && mcq.is_base && mcq.isCode);
                case 'code-variants':
                    return !(mcq.mode === 'practice' && !mcq.is_base && mcq.isCode);
                case 'exam-mcq':
                    return !(mcq.mode === 'exam' && !mcq.isCode);
                case 'exam-code':
                    return !(mcq.mode === 'exam' && mcq.isCode);

                default:
                    return true; // Keep everything if filter is unknown (shouldn't happen)
            }
        });

        const numDeleted = unit.mcqs.length - mcqsToKeep.length;
        if (numDeleted === 0) {
            return res.status(200).json({ message: "No MCQs matched the filter to delete." });
        }

        unit.mcqs = mcqsToKeep; // Replace the old array with the filtered one
        subject.updatedAt = new Date();
        const savedSubject = await subject.save();

        console.log(`✅ Successfully deleted ${numDeleted} MCQs based on filter.`);
        res.status(200).json(savedSubject);

    } catch (err) {
        console.error('❌ DELETE /unit/mcqs-by-filter - Error:', err.message);
        res.status(500).json({ error: 'Failed to bulk delete MCQs.', details: err.message });
    }
});


app.post('/generate-learning-outcomes', async (req, res) => {
    console.log('🚀 POST /generate-learning-outcomes - Request received.');
    try {
        const { readingMaterial } = req.body;
        console.log('🤖 Calling Gemini API for standard learning outcomes...');
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
       const prompt = `
Instructions:
Analyze the provided reading material to identify the main subtopics exactly as mentioned in the content.
Preserve complete compound terms (e.g., “Full Binary Tree”, “Balanced Binary Tree”, “Binary Search Tree”) without shortening them.
Do not include or assume any additional sub-concepts beyond what appears as a heading or subheading.
For each identified subtopic, generate one learning outcome using an action-oriented verb prefixed by an appropriate Bloom’s cognitive level: understanding, remembering, analyzing, or applying.
Each learning outcome should represent a clear and assessable conceptual or theoretical skill — exclude coding-related outcomes.
Use lowercase snake_case format and preserve all important topic words.
Avoid duplication, and ensure that outcomes reflect both conceptual understanding and practical application.

Format Example:
understanding_introduction_to_css
understanding_features_of_css
applying_ways_to_apply_css
understanding_selectors_in_css

Format the output as a raw JSON object:
{ "learning_outcomes": ["Outcome 1", "Outcome 2"] }

Text:
---
${readingMaterial}
---
`;


        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const generatedData = JSON.parse(aiResponseText);
        console.log(`✅ POST /generate-learning-outcomes - Successfully generated ${generatedData.learning_outcomes.length} outcomes.`);
        res.status(200).json(generatedData);
    } catch (err) {
        console.error('❌ POST /generate-learning-outcomes - Error:', err.message);
        res.status(500).json({ error: "Failed to generate learning outcomes.", details: err.message });
    }
});


//Generates coding-specific learning outcomes (syntax, logic, debugging).
app.post('/generate-code-outcomes', async (req, res) => {
    console.log('🚀 POST /generate-code-outcomes - Request received.');
    try {
        const { readingMaterial } = req.body;
        console.log('🤖 Calling Gemini API for CODE-SPECIFIC learning outcomes...');
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const prompt = `
Instructions:
Analyze the provided reading material and identify the main headings and subtopics exactly as they appear. 
For each heading or subtopic, generate **one coding-focused learning outcome** only if the material includes code, syntax, implementation, or example related to programming. 
Do NOT generate outcomes for topics that only contain definitions, theory, or conceptual explanations without any coding relevance.
Use an action-oriented verb prefixed with an appropriate Bloom’s cognitive level: understanding, remembering, analyzing, or applying.
Each learning outcome should represent a clear and assessable coding skill or understanding. 
Output must be in lowercase snake_case format. Avoid duplication.

Format Example:
understanding_variables_and_data_types
applying_for_loops
analyzing_conditional_statements
understanding_object_oriented_programming
applying_methods_and_functions
analyzing_exception_handling

Output as a raw JSON object:
{ "learning_outcomes": ["outcome_1", "outcome_2", "..."] }

Text:
---
${readingMaterial}
---
`;


       const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const generatedData = JSON.parse(aiResponseText);
        console.log(`✅ POST /generate-code-outcomes - Successfully generated ${generatedData.learning_outcomes.length} code outcomes.`);
        res.status(200).json(generatedData);
    } catch (err) {
        console.error('❌ POST /generate-code-outcomes - Error:', err.message);
        res.status(500).json({ error: "Failed to generate code learning outcomes.", details: err.message });
    }
});

// --- [FIXED] REBUILT Question Generation Handler (Handles all types) ---
const handleQuestionGeneration = async (req, res) => {
    const isCode = req.path.includes('code');
    const mode = req.path.includes('practice') ? 'practice' : 'exam';
    const { subjectName, topicName, unitName, toughness, readingMaterial, learningOutcomes } = req.body;

    // Validation
    if (!subjectName || !topicName || !unitName || !toughness || !readingMaterial || !learningOutcomes) {
        return res.status(400).json({ error: "Missing required parameters for question generation." });
    }
    console.log(`🚀 Generating ${mode} ${isCode ? 'code' : 'standard'} questions for ${subjectName}/${topicName}/${unitName}`);

    try {
        // --- AI Generation ---
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const learningOutcomesText = learningOutcomes.map((lo, i) => `${i + 1}. ${lo}`).join('\n');
        
        let prompt;
        
        if (isCode) {
            let cognitiveLevels;
            if (mode === 'practice') {
                cognitiveLevels = { high: "REMEMBERING, UNDERSTANDING, ANALYZING, EVALUATING", low: "APPLYING" };
            } else { // mode === 'exam'
                cognitiveLevels = { high: "APPLYING", low: "REMEMBERING, UNDERSTANDING, ANALYZING, EVALUATING" };
            }

            
             prompt = `
            You are an expert programming assessment creator. Generate a JSON object with one coding-based question for each learning outcome below.
            
            Question Guidelines:

Each question must present a single, clear problem using positive language.

All questions must include relevant code and require both question text and code to answer.

Prefer phrasing such as “What will be the output of the following code snippet?”, “Predict the output of the given code”, or “What does the program print?” instead of direct numeric questions.
Avoid tricky, misleading, or overly complex wording.

Ensure grammatical and syntactical accuracy throughout.

Questions must align strictly with the provided reading material.

Code Guidelines:

Include a valid, relevant code snippet for every question.

Ensure the code directly supports the concept being tested.

Options Guidelines:

Limit options to four per question with consistent phrasing and similar length.

Avoid absolutes like “always” or “never.”

Ensure no option wording reveals the correct answer.

Wrong Options Guidelines:

Distractors must be plausible, closely related, and require conceptual understanding to eliminate.

Represent realistic incorrect outcomes, not random errors.

Correct Option Guidelines:

Randomize correct option positions.

Ensure the correct answer is technically accurate and aligns with the question’s focus.

Explanation Guidelines:

Clearly explain why the correct answer is right using only concepts from the reading material.

Briefly contrast with incorrect options without referencing “option 1,” “option 2,” etc.

Use only relevant terminology found in the session or material.
 Learning Outcomes to Assess:
    ---
    ${learningOutcomesText}
    ---
    
    Output Schema (Strict JSON):
    Your output must be a JSON object with a key "mcqs", which is an array of questions. Follow the schema for each question type precisely.

    1. For 'CODE_ANALYSIS_MULTIPLE_CHOICE':
    The 'options' array should contain multiple objects, only one of which has "is_correct": true.
    \`\`\`json
    {
      "core_concept": "string", "question_key": "string", "bloom_level": "string", "skills": ["string"],
      "toughness": "${toughness.toUpperCase()}", "question_type": "CODE_ANALYSIS_MULTIPLE_CHOICE",
      "question": { "content": "string", "code_snippet": "string" },
      "options": [
        { "content": "Correct Answer", "is_correct": true },
        { "content": "Wrong Answer 1", "is_correct": false },
        { "content": "Wrong Answer 2", "is_correct": false }
      ],
      "explanation_for_answer": { "content": "string" }
    }
    \`\`\`

    Reading Material to Use:
    ---
    ${readingMaterial}
    ---
`;
        

        } else {
            const cognitiveLevels = { low: "APPLYING, ANALYZING, EVALUATING", high: "REMEMBERING, UNDERSTANDING" };

            prompt = `
    You are an expert assessment creator. Your task is to generate a JSON object containing a variety of high-quality, standalone quiz questions based on the provided reading material and learning outcomes.

    **Overall Generation Plan:**
    - For each learning outcome, generate one question.
    - All questions must be of type 'MULTIPLE_CHOICE' with only one correct option.

    **Critical Quality Rules for ALL Questions:**
    1.  **Standalone Questions (CRITICAL):** Each question must be self-contained. DO NOT use phrases like "according to the session," "based on the provided text," or any similar reference to the source material. The student will not have the text.
    - **striclty** give the questions from reading material only. Do not assume or add any extra information.
    2.  **No Code Snippets:** For these questions, DO NOT include any code snippets or programming syntax.
    3.  **All Options from Material:** All options (both correct and incorrect) MUST be plausible terms or concepts from the reading material.
    4.  **Plausible Distractors:** Wrong options must be believable and relevant, representing common misunderstandings.
    5.  **Clarity and Focus:** Each question must focus on one clear concept. Avoid generic or ambiguous questions.
    6.  **Positive Phrasing:** Frame questions positively. Avoid confusing or tricky wording.
    7.  **Option Consistency:**
        - Provide exactly four (4) options for each question.
        - Keep all options similar in length and tone.
        - Avoid absolute terms like "always" or "never".
        - Use "All of the given options" or "None of the given options" instead of "All of the above or None of the above".
    8.  **Grammar:** Ensure perfect grammar and syntax.
    9.  **Single Skill:** The "skills" array MUST contain exactly ONE string — the specific learning outcome being assessed.

    **Explanation Guidelines:**

1. Give a strong reasoning for why the option is correct, focusing on the key information that is only mentioned in provided content.
2. Briefly indicate why other options are incorrect, highlighting the distinctions from the correct answer.
3. Explanation shouldn't contain the terms "options", "option 2", etc.
4. The technical terminology should be from the session. Example, if "Separation of concerns" is not in session, then explanation shouldn't contain "Separation of concerns".
5.  DO NOT use phrases like "according to the session," "based on the provided text,", "The reading material states that", "the reading material describes" or any similar reference to the source material. The student will not have the text.

    **Generation Request & Cognitive Distribution:**
    - Mode: ${mode.toUpperCase()}
    - Toughness: ${toughness.toUpperCase()}
    - Cognitive Levels: Generate 70% of questions from the high priority levels and 30% from the low priority levels.
      - High Priority: ${cognitiveLevels.high}
      - Low Priority: ${cognitiveLevels.low}

    **Learning Outcomes to Assess:**
    ---
    ${learningOutcomesText}
    ---

    **Output Schema (Strict):**
    \`\`\`json
    {
      "mcqs": [
        {
          "core_concept": "string",
          "question_key": "string",
          "bloom_level": "string (e.g., UNDERSTANDING, APPLYING)",
          "skills": ["string (MUST contain only ONE most relevant skill)"],
          "toughness": "${toughness.toUpperCase()}",
          "question_type": "MULTIPLE_CHOICE",
          "question": {
            "content": "string",
            "content_type": "MARKDOWN"
          },
          "options": [
            { "content": "string", "is_correct": true },
            { "content": "string", "is_correct": false },
            { "content": "string", "is_correct": false },
            { "content": "string", "is_correct": false }
          ],
          "explanation_for_answer": { "content": "string" }
        }
      ]
    }
    \`\`\`

    Reading Material to Use:
    ---
    ${readingMaterial}
    ---`;
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const generatedData = JSON.parse(aiResponseText);
        
        // --- Find the correct unit to get the existing question count ---
        const subjectForCount = await Subject.findOne({ subject_name: subjectName });
        const topicForCount = subjectForCount?.topics.find(t => t.topic_name === topicName);
        const unitForCount = topicForCount?.units.find(u => u.unit_name === unitName);
        const baseQuestionCount = unitForCount ? unitForCount.mcqs.filter(q => q.is_base).length : 0;
        const topicPrefix = getTopicPrefix(topicName);

        // --- Data Preparation (with updated tags) ---
        const newMcqs = generatedData.mcqs.map((mcq, index) => {
            const normalizedConcept = normalizeConcept(mcq.core_concept);
            const bloomLevel = mcq.bloom_level || 'UNKNOWN';
            const questionNumber = baseQuestionCount + index + 1;
            const formattedNumber = String(questionNumber).padStart(2, '0');
            const newQuestionKey = `${topicPrefix}${formattedNumber}`;
            
            const tagNames = [unitName, newQuestionKey, normalizedConcept, bloomLevel, learningOutcomes[index] || ''];
            const { bloom_level, ...restOfMcq } = mcq;

            return {
                ...restOfMcq,
                question_key: newQuestionKey,
                question_id: generateUUID(),
                mode, is_base: true, isCode,
                //language: 'python', // Or get from req.body if you add it to the form
                question: { ...mcq.question, tag_names: tagNames },
            };
        });

        // --- DATABASE UPDATE LOGIC ---
        let subject = await Subject.findOne({ subject_name: subjectName });
        if (!subject) {
            subject = await Subject.create({ subject_name: subjectName, topics: [] });
        }

        let topic = subject.topics.find(t => t.topic_name === topicName);
        if (!topic) {
            subject.topics.push({ topic_name: topicName, units: [] });
            topic = subject.topics[subject.topics.length - 1];
        }

        let unit = topic.units.find(u => u.unit_name === unitName);
        if (!unit) {
            topic.units.push({
                unit_name: unitName,
                readingMaterial,
                learningOutcomes,
                mcqs: newMcqs
            });
        } else {
            unit.readingMaterial = readingMaterial;
            unit.learningOutcomes = [...new Set([...unit.learningOutcomes, ...learningOutcomes])];
            unit.mcqs.push(...newMcqs);
        }

        subject.updatedAt = new Date();
        const savedSubject = await subject.save();

        console.log(`✅ Successfully saved ${newMcqs.length} MCQs.`);
        res.status(200).json(savedSubject);

    } catch (err) {
        console.error(`❌ Error during question generation:`, err.stack);
        res.status(500).json({ error: "An internal server error occurred during generation.", details: err.message });
    }
};

// All generation routes now point to the same handler
app.post('/generate-practice', handleQuestionGeneration);
app.post('/generate-exam', handleQuestionGeneration);
app.post('/generate-practice-code', handleQuestionGeneration);
app.post('/generate-exam-code', handleQuestionGeneration);


// --- Code Execution Endpoint (No Changes Needed) ---

// [NEW] CODE EXECUTION ENDPOINT
app.post('/api/execute-code', async (req, res) => {
    const { source_code, language_id } = req.body;
    console.log(`🚀 POST /api/execute-code - Executing code for language ID: ${language_id}`);

    if (!source_code || !language_id) {
        return res.status(400).json({ error: 'Source code and language ID are required.' });
    }

    const options = {
        method: 'POST',
        url: 'https://judge0-ce.p.rapidapi.com/submissions',
        params: {
            base64_encoded: 'false',
            fields: '*'
        },
        headers: {
            'content-type': 'application/json',
            'X-RapidAPI-Key': process.env.JUDGE0_API_KEY, // Your key from .env
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        },
        data: {
            language_id: language_id,
            source_code: source_code,
        }
    };

    try {
        // 1. Submit the code to Judge0
        const submissionResponse = await axios.request(options);
        const token = submissionResponse.data.token;

        if (!token) {
            return res.status(500).json({ error: 'Failed to get submission token.' });
        }

        let resultResponse;
        let statusId;

        // 2. Poll for the result using the token until it's processed
        do {
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds between checks

            resultResponse = await axios.request({
                method: 'GET',
                url: `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
                params: { base64_encoded: 'false', fields: '*' },
                headers: {
                    'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
                    'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
                }
            });
            statusId = resultResponse.data.status.id;
        } while (statusId === 1 || statusId === 2); // Status 1: In Queue, Status 2: Processing

        console.log(`✅ POST /api/execute-code - Execution complete. Status: ${resultResponse.data.status.description}`);
        res.status(200).json(resultResponse.data);

    } catch (error) {
        const errorData = error.response ? error.response.data : { message: error.message };
        console.error('❌ POST /api/execute-code - Error:', errorData);
        res.status(500).json({ error: 'An error occurred while executing the code.', details: errorData });
    }
});




// --- [REFACTORED] VARIANT GENERATION (Standard MCQs) ---
const handleStandardVariantGeneration = async (req, res) => {
    const { subjectName, topicName, unitName, numVariants } = req.body;
    
    console.log(`🚀 Generating standard variants for ${subjectName}/${topicName}/${unitName}`);

    try {
        const subject = await Subject.findOne({ subject_name: subjectName });
        if (!subject) return res.status(404).json({ error: 'Subject not found.' });
        
        const topic = subject.topics.find(t => t.topic_name === topicName);
        if (!topic) return res.status(404).json({ error: 'Topic not found.' });

        const unit = topic.units.find(u => u.unit_name === unitName);
        if (!unit) return res.status(404).json({ error: 'Unit not found.' });

        const baseMcqs = unit.mcqs.filter(mcq => mcq.is_base === true && !mcq.isCode && mcq.mode === 'practice');
        if (baseMcqs.length === 0) {
            return res.status(404).json({ error: `No base standard practice questions found to generate variants from.` });
        }

        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        let allNewVariants = [];

        for (const baseMcq of baseMcqs) {
            let variantGenerationRules = '';
            if (baseMcq.options.length === 2 && baseMcq.options.some(o => o.content.toLowerCase() === 'true')) {
                variantGenerationRules = `- This is a True/False question. The variants must also be True/False questions with exactly two options: "True" and "False".`;
            } else if (baseMcq.options.filter(o => o.is_correct).length > 1) {
                variantGenerationRules = `- This is a 'MORE_THAN_ONE_MULTIPLE_CHOICE' question. The variants must also have multiple correct answers out of four options.`;
            } else {
                variantGenerationRules = `- This is a standard 'MULTIPLE_CHOICE' question. The variants must also have exactly one correct answer out of four options.`;
            }

            const variantPrompt = `
                You are an expert assessment creator. Generate ${numVariants} new, distinct variants of the base question provided below.

                **Base Question Details:**
                - Question: ${baseMcq.question.content}
                - Core Concept: ${baseMcq.core_concept}
                - Type-Specific Rules:
                ${variantGenerationRules}
               When creating variants, ensure diversity across these types:
 **Do not repeat the base question in any variant. Each variant must be uniquely phrased and assess the same concept without copying or reusing the base question text.**
1. **Standard Multiple Choice (Single Correct)** – e.g., “Which command is used to move files?”
2. If possible give the **More Than One Correct (Multiple Answers)** – e.g., “Which of the following commands can rename or move a file?” *if not possible, give a Scenario-based question instead.*
3. must give **True/False** – e.g.,"The mv command can rename directories.”
4.must give  **Statement-Based** – e.g.,
   Statement I: mv can rename a file.
   Statement II: mv cannot move directories.
   Options:
   A) Only Statement I is true  
   B) Only Statement II is true  
   C) Both Statements are true  
   D) Both Statements are false
5. must give **Fill in the Blank** – e.g., “The command used to delete a directory and its contents is \_\_\_\_\_\_\_\_.”

**Variant Mix Rule:**
For every base question, generate at least:
- 1 Standard MCQ
- 1 More-than-one-correct (MORE_THAN_ONE_MULTIPLE_CHOICE) / Scenario-based (if applicable)
- 1 True/False
- 1 Statement-based
- 1 Fill-in-the-Blank

If fewer total variants are requested, still try to **cover as many different types** as possible, rather than repeating MCQs.

**Allowed Variant Types and Mapping to "question_type":**
1. Standard MULTIPLE_CHOICE (single correct) → question_type: "MULTIPLE_CHOICE"
2. True/False MULTIPLE_CHOICE → question_type: "MULTIPLE_CHOICE"
3. Statement-Based MULTIPLE_CHOICE → question_type: "MULTIPLE_CHOICE"
4. Fill-in-the-Blank MULTIPLE_CHOICE → question_type: "MULTIPLE_CHOICE"
5. MORE_THAN_ONE_MULTIPLE_CHOICE (two or more correct options) → question_type: "MORE_THAN_ONE_MULTIPLE_CHOICE"
6. Scenario-Based MULTIPLE_CHOICE → question_type: "MULTIPLE_CHOICE"
**Do NOT generate scenario-heavy questions.**


                **Critical Quality Rules for ALL Variants:**
                1.  **Standalone Questions (CRITICAL):** Variants MUST be self-contained. DO NOT use phrases like "according to the session," "based on the provided text," or any reference to the source material.
                2.  **Test Same Concept:** Variants must test the SAME core concept and skill as the base question.
                3.  **All Options from Material:** ALL options (correct and incorrect) MUST be plausible terms or concepts explicitly found in the reading material.
                4.  **Plausible Distractors:** Incorrect options must be believable and relevant.
                5.  **Option Consistency:** Ensure all options in a question are of similar length and grammatical structure. Use "All of the given options" or "None of the given options" instead of "...of the above".
                6.  **CRITICAL Option Schema:** Every option object MUST have an "is_correct" boolean field.
                7.  Use plain, easy-to-understand words. Avoid jargon, complex sentence structures, or advanced terminology.
                8.  Each variant should help learners understand the core concept being tested — not trick them. Questions must test conceptual understanding rather than unnecessary complexity.
                9.  Explanations must be clear, concise, and written in simple language. DO NOT include any references such as “according to the reading material,” “the document states,” “from the content above,” or any source-based phrasing. Instead, directly explain why the correct answer is correct in a general, standalone way.
                10. **Ensure the grammar and syntax are perfect.**

                Explanation Guidelines:

Clearly explain why the correct answer is right using only concepts from the reading material.

Briefly contrast with incorrect options without referencing “option 1,” “option 2,” etc.

Use only relevant terminology found in the session or material.

                Output Schema (Strict):
                \`\`\`json
                { "mcqs": [{ "core_concept": "${baseMcq.core_concept}", "question_key": "string", "skills": ${JSON.stringify(baseMcq.skills)}, "toughness": "${baseMcq.toughness}", "question_type": "string", "question": { "content": "string", "content_type": "MARKDOWN", "tag_names": ${JSON.stringify(baseMcq.question.tag_names)} }, "options": [ { "content": "string", "is_correct": true }, { "content": "string", "is_correct": false } ], "explanation_for_answer": { "content": "string" } }] }
                \`\`\`

                Reading Material to Use:
                ---
                ${unit.readingMaterial}
                ---
            `;
            
            const result = await model.generateContent(variantPrompt);
            const response = await result.response;
            const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const generatedData = JSON.parse(aiResponseText);

            if (generatedData && Array.isArray(generatedData.mcqs)) {
                const processedVariants = generatedData.mcqs.map(variant => ({
                    ...variant,
                    question_id: generateUUID(),
                    is_base: false,
                    base_question_id: baseMcq.question_id,
                    isCode: false, // Explicitly false for standard variants
                    mode: 'practice',
                    language: baseMcq.language,
                }));
                allNewVariants.push(...processedVariants);
            }
        }
        
        if (allNewVariants.length > 0) {
            unit.mcqs.push(...allNewVariants);
            subject.updatedAt = new Date();
            const savedSubject = await subject.save();
            console.log(`✅ Generated and saved ${allNewVariants.length} standard variants.`);
            res.status(200).json(savedSubject);
        } else {
            res.status(200).json({ message: "No new standard variants were generated." });
        }
    } catch (err) {
        console.error(`❌ Error during standard variant generation:`, err);
        res.status(500).json({ error: "An internal server error during standard variant generation.", details: err.message });
    }
};

// --- [REFACTORED] VARIANT GENERATION (Code MCQs) ---
const handleCodeVariantGeneration = async (req, res) => {
    const { subjectName, topicName, unitName, numVariants } = req.body;
    
    console.log(`🚀 Generating code variants for ${subjectName}/${topicName}/${unitName}`);

    try {
        const subject = await Subject.findOne({ subject_name: subjectName });
        if (!subject) return res.status(404).json({ error: 'Subject not found.' });
        
        const topic = subject.topics.find(t => t.topic_name === topicName);
        if (!topic) return res.status(404).json({ error: 'Topic not found.' });

        const unit = topic.units.find(u => u.unit_name === unitName);
        if (!unit) return res.status(404).json({ error: 'Unit not found.' });

        const baseMcqs = unit.mcqs.filter(mcq => mcq.is_base === true && mcq.isCode === true && mcq.mode === 'practice');
        if (baseMcqs.length === 0) {
            return res.status(404).json({ error: `No base code practice questions found to generate variants from.` });
        }

        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        let allNewVariants = [];

        for (const baseMcq of baseMcqs) {
            let variantPrompt;
            // if (baseMcq.question_type === 'CODE_ANALYSIS_TEXTUAL') {
            //     variantPrompt = `
            //         You are an expert programming assessment creator. The base question is a "fill-in-the-blank" type. Generate ${numVariants} new, distinct variants of it.

            //         Core Rules:
            //         **Strictly** maintain the "CODE_ANALYSIS_TEXTUAL" question type.
            //         The "question_type" for all generated questions (including variants) must be "CODE_ANALYSIS_TEXTUAL".
            //         Variants must test the SAME core concept.
            //         The new code_snippet MUST contain a placeholder like _________.
            //         The question text must never mention “blank” or “fill in the blank.”
            //         The blank (_________) should appear only in the code snippet, not in the question.
            //         All questions must be self-contained — do NOT reference external material.
            //         The "options" array MUST contain exactly ONE object with "is_correct": true.
            //         Use clear, simple, and unambiguous language.

            //         Variant Types to Include (internal generation logic only):
            //         Output Prediction (Textual Fill-in-the-Blank): Ask learners to predict the output of a given code snippet. The code may contain a placeholder (_________), but the question itself should not mention it. Use natural phrasing such as: What will be the output of the following code? What is printed when this code is executed? What will the program display after execution? Ensure question_type remains "CODE_ANALYSIS_TEXTUAL".
            //         Code Completion (Fill-in-the-Blank): Ask learners to determine what should replace the blank in the code to achieve a specific output or functionality. The question should describe the expected behavior or output — not the blank. Use phrasing such as: What should replace the missing statement to print ‘Hello World’? Which expression should be used to display ‘The sum is 30’? What line should be added to make the code return ‘Success’? Ensure question_type remains "CODE_ANALYSIS_TEXTUAL".
                    
            //         **Additional Guidelines for Generating Variants:**
            //         - Ensure the code snippet is valid, relevant, and directly related to the core concept.
            //         - The question text must require both the code and the placeholder to answer correctly.
            //         - Avoid tricky, misleading, or ambiguous wording.
            //         - Explanations must clearly state why the answer is correct without referencing external material or the reading session.
            //         - Options should be precise and technically accurate; the correct answer should align perfectly with the intended output or code completion.

            //         **Base Question:**
            //         - Concept: ${baseMcq.core_concept}
            //         - Question: ${baseMcq.question.content}
            //         - Code Snippet: ${baseMcq.question.code_snippet}

            //         **Output Schema (Strict JSON):**
            //         \`\`\`json
            //         { "mcqs": [ { "core_concept": "${baseMcq.core_concept}", "question_key": "string", "skills": ${JSON.stringify(baseMcq.skills)}, "toughness": "${baseMcq.toughness}", "question_type": "CODE_ANALYSIS_TEXTUAL", "question": { "content": "string", "code_snippet": "string with _________", "tag_names": ${JSON.stringify(baseMcq.question.tag_names)} }, "options": [ { "content": "string (the single correct answer)", "is_correct": true } ], "explanation_for_answer": { "content": "string" } } ] }
            //         \`\`\`
            //     `;
            // } else { // CODE_ANALYSIS_MULTIPLE_CHOICE
                variantPrompt = `
                    You are an expert programming assessment creator. The base question is of type "CODE_ANALYSIS_MULTIPLE_CHOICE". Generate ${numVariants} new, distinct variants of it.

                    **Core Rules:**
                    - All variants must remain "CODE_ANALYSIS_MULTIPLE_CHOICE" type.
                    - Each variant must test the SAME core concept as the base question.
                    - Use only relevant variant types that logically fit the given base question (ignore irrelevant ones).
                    - Every option object MUST have an "is_correct" boolean field.
                    - All questions must be fully self-contained — do NOT reference any external material.
                    - Use clear, simple, and unambiguous language.
                    - **Do not repeat the full code in the question text.**
                    - **Include the full code ONLY in the "code_snippet" field.**

                    **Allowed Variant Types (use maximum possible where suitable):**
                    1. **Code Analysis – Output Prediction**: Ask for the output of the given code. Example: "What is the output of the given code?"
                    2. **Code Analysis – Output Prediction (True/False)**: Ask a true/false question about the code’s output. Example: "The output of the given code is 10. True or False?"
                    3. **Code Analysis – Error Identification**: Ask what error exists in the code. Example: "What error does the given code produce?"
                    4. **Code Analysis – Error Identification (True/False)**: State an error and ask if it’s true or false. Example: "The code will throw a syntax error. True or False?"
                    5. **Code Analysis – Identify and Fix Error**: Ask how to fix an identified error. Example: "How can the given code be corrected?"
                    6. **Code Analysis – Identify and Fix Error (True/False)**: State a possible fix and ask if it’s correct (True/False). Example: "Changing '==' to '=' fixes the error. True or False?"
                    7. **Code Analysis – Identify Functionality**: Ask about the purpose or behavior of the given code. Example: "What is the purpose of the given code snippet?"

                    **Additional Variant Styles (optional when relevant):**
                    - Give code and ask which option matches the code’s behavior.
                    - Give code with multiple correct options describing its result.
                    - Provide code with an error and ask which line has the issue.
                    - Give a functionality in the question and code options to choose which achieves that functionality.

                    **IMPORTANT:**
                    - Use only those variant types that logically fit the base question’s concept.
                    - Avoid repeating the same phrasing — make each variant distinct but conceptually aligned.
                    - Maintain technical correctness and clarity across all questions and options.

                    **Base Question:**
                    - Concept: ${baseMcq.core_concept}
                    - Question: ${baseMcq.question.content}
                    - Code Snippet: ${baseMcq.question.code_snippet}

                    **Output Schema (Strict JSON):**
                   1. FOR CODE_ANALYSIS_MULTIPLE_CHOICE:
                    \`\`\`json
                    { "mcqs": [ { "core_concept": "${baseMcq.core_concept}", "question_key": "string", "skills": ${JSON.stringify(baseMcq.skills)}, "toughness": "${baseMcq.toughness}", "question_type": "CODE_ANALYSIS_MULTIPLE_CHOICE", "question": { "content": "string", "code_snippet": "string", "tag_names": ${JSON.stringify(baseMcq.question.tag_names)} }, "options": [ { "content": "string", "is_correct": true }, { "content": "string", "is_correct": false } ], "explanation_for_answer": { "content": "string" } } ] }
                    \`\`\`
                    2. FOR CODE_ANALYSIS_TEXTUAL:
                    \`\`\`json
                    { "mcqs": [ { "core_concept": "${baseMcq.core_concept}", "question_key": "string", "skills": ${JSON.stringify(baseMcq.skills)}, "toughness": "${baseMcq.toughness}", "question_type": "CODE_ANALYSIS_TEXTUAL", "question": { "content": "string", "code_snippet": "string with _________", "tag_names": ${JSON.stringify(baseMcq.question.tag_names)} }, "options": [ { "content": "string (the single correct answer)", "is_correct": true }   ], "explanation_for_answer": { "content": "string" } } ] }
                    \`\`\`
                `;
            
            const finalPrompt = `${variantPrompt}\nReading Material to Use:\n---\n${unit.readingMaterial}\n---`;

            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const generatedData = JSON.parse(aiResponseText);

            if (generatedData && Array.isArray(generatedData.mcqs)) {
                const processedVariants = generatedData.mcqs.map(variant => ({
                    ...variant,
                    question_id: generateUUID(),
                    is_base: false,
                    base_question_id: baseMcq.question_id,
                    isCode: true, // Explicitly true for code variants
                    mode: 'practice',
                    language: baseMcq.language, // Inherit language
                }));
                allNewVariants.push(...processedVariants);
            }
        }
        
        if (allNewVariants.length > 0) {
            unit.mcqs.push(...allNewVariants);
            subject.updatedAt = new Date();
            const savedSubject = await subject.save();
            console.log(`✅ Generated and saved ${allNewVariants.length} code variants.`);
            res.status(200).json(savedSubject);
        } else {
            res.status(200).json({ message: "No new code variants were generated." });
        }
    } catch (err) {
        console.error(`❌ Error during code variant generation:`, err);
        res.status(500).json({ error: "An internal server error during code variant generation.", details: err.message });
    }
};


app.post('/unit/generate-variants', handleStandardVariantGeneration);
app.post('/unit/generate-code-variants', handleCodeVariantGeneration);








// --- [REFACTORED] DELETE Endpoints ---

// Delete a specific MCQ from a unit
app.delete('/unit/mcq', async (req, res) => {
    const { subjectName, topicName, unitName, questionId } = req.body;
    console.log(`🚀 DELETE /unit/mcq - Request to delete MCQ ${questionId}`);

    try {
        const subject = await Subject.findOne({ subject_name: subjectName });
        if (!subject) return res.status(404).json({ error: 'Subject not found.' });

        const topic = subject.topics.find(t => t.topic_name === topicName);
        if (!topic) return res.status(404).json({ error: 'Topic not found.' });

        const unit = topic.units.find(u => u.unit_name === unitName);
        if (!unit) return res.status(404).json({ error: 'Unit not found.' });

        const mcqIndex = unit.mcqs.findIndex(mcq => mcq.question_id === questionId);
        if (mcqIndex === -1) return res.status(404).json({ error: 'MCQ not found.' });

        unit.mcqs.splice(mcqIndex, 1);
        subject.updatedAt = new Date();
        const savedSubject = await subject.save();

        console.log(`✅ Successfully deleted MCQ.`);
        res.status(200).json(savedSubject);
    } catch (err) {
        console.error('❌ DELETE /unit/mcq - Error:', err.message);
        res.status(500).json({ error: 'Failed to delete MCQ.', details: err.message });
    }
});

// Delete an entire Subject(main topic)
app.delete('/subject/:subjectId', async (req, res) => {
    const { subjectId } = req.params;
    console.log(`🚀 DELETE /subject/${subjectId} - Request to delete entire subject.`);
    try {
        await Subject.findByIdAndDelete(subjectId);
        console.log(`✅ DELETE /subject/${subjectId} - Successfully deleted subject.`);
        res.status(200).json({ message: `Successfully deleted subject.` });
    } catch (err) {
        console.error(`❌ DELETE /subject/${subjectId} - Error:`, err.message);
        res.status(500).json({ error: "An internal server error occurred.", details: err.message });
    }
});


// Delete an entire topic from a subject
app.delete('/topic', async (req, res) => {
    const { subjectName, topicName } = req.body;
    console.log(`🚀 DELETE /topic - Request to delete topic: ${topicName}`);
    try {
        await Subject.updateOne(
            { subject_name: subjectName },
            { $pull: { topics: { topic_name: topicName } } }
        );
        console.log(`✅ Successfully deleted topic.`);
        res.status(200).json({ message: 'Successfully deleted topic.' });
    } catch (err) {
        console.error('❌ DELETE /topic - Error:', err.message);
        res.status(500).json({ error: 'Failed to delete topic.', details: err.message });
    }
});

// Delete an entire unit from a topic
app.delete('/unit', async (req, res) => {
    const { subjectName, topicName, unitName } = req.body;
    console.log(`🚀 DELETE /unit - Request to delete unit: ${unitName}`);
    try {
        await Subject.updateOne(
            { subject_name: subjectName, "topics.topic_name": topicName },
            { $pull: { "topics.$.units": { unit_name: unitName } } }
        );
        console.log(`✅ Successfully deleted unit.`);
        res.status(200).json({ message: 'Successfully deleted unit.' });
    } catch (err) {
        console.error('❌ DELETE /unit - Error:', err.message);
        res.status(500).json({ error: 'Failed to delete unit.', details: err.message });
    }
});



// --- [REFACTORED] UPDATE Endpoint ---
app.put('/unit/mcq', async (req, res) => {
    const { subjectName, topicName, unitName, updatedMcq } = req.body;
    console.log(`🚀 PUT /unit/mcq - Request to update MCQ ${updatedMcq.question_id}`);

    try {
        const subject = await Subject.findOne({ subject_name: subjectName });
        if (!subject) return res.status(404).json({ error: 'Subject not found.' });

        const topic = subject.topics.find(t => t.topic_name === topicName);
        if (!topic) return res.status(404).json({ error: 'Topic not found.' });

        const unit = topic.units.find(u => u.unit_name === unitName);
        if (!unit) return res.status(404).json({ error: 'Unit not found.' });
        
        const mcqIndex = unit.mcqs.findIndex(mcq => mcq.question_id === updatedMcq.question_id);
        if (mcqIndex === -1) return res.status(404).json({ error: 'MCQ not found.' });

        // Replace the old MCQ with the updated one
        unit.mcqs[mcqIndex] = updatedMcq;
        subject.updatedAt = new Date();
        const savedSubject = await subject.save();
        
        console.log(`✅ PUT /unit/mcq - Successfully updated MCQ.`);
        res.status(200).json(savedSubject);
    } catch (err) {
        console.error(`❌ PUT /unit/mcq - Error:`, err.message);
        res.status(500).json({ error: 'Failed to update MCQ.', details: err.message });
    }
});





// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

