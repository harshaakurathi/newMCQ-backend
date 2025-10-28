require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const MCQ = require('../models/mcqModel'); // Adjust path if needed

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// At the top with your other require statements
const axios = require('axios');
// --- Database Connection ---

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected successfully.'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- Helper Functions ---
function generateUUID() { return crypto.randomUUID(); }

function normalizeConcept(concept) {
    if (!concept) return 'general';
    // Shorten to 1-2 words by taking the first two words if available
    const parts = concept.toString().toLowerCase().trim().split(/\s+/);
    return parts.slice(0, 2).join('-');
}

// async function processAndSaveMcqs(generatedData, req, learningOutcomes) {
//     // Data Sanitization Safety Net 🛡️
//     if (generatedData && Array.isArray(generatedData.mcqs)) {
//         generatedData.mcqs.forEach(mcq => {
//             if (mcq.options && Array.isArray(mcq.options)) {
//                 mcq.options.forEach(option => {
//                     if (typeof option.is_correct === 'undefined') {
//                         console.warn(`⚠️ Sanitizing data: Found option missing 'is_correct'. Defaulting to false.`);
//                         option.is_correct = false;
//                     }
//                 });
//             }
//         });
//     }

//     // Add this helper function somewhere at the top of your file

//     const { mainTopic, readingMaterial } = req.body;
//     const mode = req.path.includes('practice') ? 'practice' : 'exam';
    
//     const finalMcqData = {
//         mainTopic,
//         readingMaterial,
//         // mcqs: generatedData.mcqs.map(mcq => {
//         //     // --- New Tagging Logic ---
//         //     const normalizedConcept = normalizeConcept(mcq.core_concept);
//         //     const bloomLevel = mcq.bloom_level || 'UNKNOWN'; // From AI response

//         // [MODIFIED] Add 'index' to the map function
//         mcqs: generatedData.mcqs.map((mcq, index) => {
//             const normalizedConcept = normalizeConcept(mcq.core_concept);
//             const bloomLevel = mcq.bloom_level || 'UNKNOWN';

//             const tagNames = [
//                 mainTopic,
//                 mcq.question_key,
//                 normalizedConcept,
//                 bloomLevel,
//                 learningOutcomes[index] // <-- This is the change
//             ];

//             // Remove the bloom_level from the top-level mcq object before saving
//             const { bloom_level, ...restOfMcq } = mcq;

//             return {
//                 ...restOfMcq,
//                 question_id: generateUUID(),
//                 mode: mode,
//                 is_base: true,
//                 isCode: false,
//                 language: 'python', // <-- [ADD THIS LINE]
//                 question: { ...mcq.question, tag_names: tagNames },
//             };
//         }),
//     };

//     const doc = await MCQ.findOneAndUpdate(
//         { mainTopic },
//         { 
//             $push: { mcqs: { $each: finalMcqData.mcqs } },
//             $set: { readingMaterial, updatedAt: new Date() }
//         },
//         { upsert: true, new: true, setDefaultsOnInsert: true }
//     );
//     console.log(`✅ ${finalMcqData.mcqs.length} MCQs processed for topic: ${mainTopic}`);
//     return doc;
// }




async function processAndSaveMcqs(generatedData, req, learningOutcomes) {
    // Data Sanitization Safety Net 🛡️
    if (generatedData && Array.isArray(generatedData.mcqs)) {
        generatedData.mcqs.forEach(mcq => {
            if (mcq.options && Array.isArray(mcq.options)) {
                mcq.options.forEach(option => {
                    if (typeof option.is_correct === 'undefined') {
                        console.warn(`⚠️ Sanitizing data: Found option missing 'is_correct'. Defaulting to false.`);
                        option.is_correct = false;
                    }
                });
            }
        });
    }

    const { mainTopic, readingMaterial } = req.body;
    const mode = req.path.includes('practice') ? 'practice' : 'exam';
    
    const finalMcqData = {
        mainTopic,
        readingMaterial,
        mcqs: generatedData.mcqs.map((mcq, index) => {
            const normalizedConcept = normalizeConcept(mcq.core_concept);
            const bloomLevel = mcq.bloom_level || 'UNKNOWN';

            const tagNames = [
                mainTopic,
                mcq.question_key,
                normalizedConcept,
                bloomLevel,
                learningOutcomes[index]
            ];

            const { bloom_level, ...restOfMcq } = mcq;

            return {
                ...restOfMcq,
                question_id: generateUUID(),
                mode: mode,
                is_base: true,
                isCode: false,
                language: 'python', // You correctly added this
                question: { ...mcq.question, tag_names: tagNames },
            };
        }),
    };

    const doc = await MCQ.findOneAndUpdate(
        { mainTopic },
        { 
            $push: { mcqs: { $each: finalMcqData.mcqs } },
            $set: { 
                readingMaterial, 
                learningOutcomes, // <-- [ADD THIS LINE]
                updatedAt: new Date() 
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`✅ ${finalMcqData.mcqs.length} MCQs processed for topic: ${mainTopic}`);
    return doc;
}



// --- API Endpoints ---

//Fetches all topics and their IDs.
app.get('/topics', async (req, res) => {
    console.log('🚀 GET /topics - Fetching all topics...');
    try {
        const topics = await MCQ.find({}, '_id mainTopic').sort({ mainTopic: 1 });
        console.log(`✅ GET /topics - Successfully fetched ${topics.length} topics.`);
        res.status(200).json(topics);
    } catch (err) {
        console.error('❌ GET /topics - Error fetching topics:', err.message);
        res.status(500).json({ error: "Failed to fetch topics.", details: err.message });
    }
});

//Fetches a single topic’s full data by ID.
app.get('/topic/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`🚀 GET /topic/${id} - Fetching data for a single topic...`);
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.warn(`⚠️ GET /topic/${id} - Invalid document ID format.`);
            return res.status(400).json({ error: "Invalid document ID format." });
        }
        const topicData = await MCQ.findById(id);
        if (!topicData) {
            console.warn(`⚠️ GET /topic/${id} - Topic not found.`);
            return res.status(404).json({ error: `Topic with ID ${id} not found.` });
        }
        console.log(`✅ GET /topic/${id} - Successfully fetched topic: "${topicData.mainTopic}"`);
        res.status(200).json(topicData);
    } catch (err) {
        console.error(`❌ GET /topic/${id} - Error fetching topic data:`, err.message);
        res.status(500).json({ error: "Failed to fetch topic data.", details: err.message });
    }
});

//Generates general learning outcomes from reading material using Gemini.
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

//generate-practice and generate-exam MCQs endpoints
const handleQuestionGeneration = async (req, res) => {
    const mode = req.path.includes('practice') ? 'practice' : 'exam';
    const { mainTopic, toughness, readingMaterial, learningOutcomes } = req.body;

    try {
        if (!mainTopic || !toughness || !readingMaterial || !learningOutcomes || !Array.isArray(learningOutcomes) || learningOutcomes.length === 0) {
           return res.status(400).json({ error: "Missing required parameters." });
        }
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const cognitiveLevels = mode === 'practice'
            ? { high: "UNDERSTANDING, ANALYZING, REMEMBERING", low: "APPLYING" }
            : { high: "APPLYING", low: "UNDERSTANDING, ANALYZING, REMEMBERING" };

        const learningOutcomesText = learningOutcomes.map((lo, index) => `${index + 1}. ${lo}`).join('\n');

        const prompt = `
            You are an expert assessment creator. Your task is to generate a JSON object containing a variety of high-quality, standalone quiz questions based on the provided reading material and learning outcomes.

            **Overall Generation Plan:**
            - For each learning outcome, generate one question.
            - If there are 3 or more learning outcomes, ensure you generate AT LEAST ONE of each of the following question types:
                1. A standard single-correct 'MULTIPLE_CHOICE' question.
                2. A 'MORE_THAN_ONE_MULTIPLE_CHOICE' question where two or more options are correct.
                3. A simple True/False 'MULTIPLE_CHOICE' question (options must be exactly "True" and "False").
            - The remaining questions should be standard single-correct 'MULTIPLE_CHOICE'.

            **Critical Quality Rules for ALL Questions:**
            1.  **Standalone Questions (CRITICAL):** Questions MUST be self-contained. DO NOT use phrases like "according to the session," "based on the provided text," or any similar reference to the source material. The student will not have the text.
            2.  **No Code Snippets:** For these standard questions, DO NOT include any code snippets or programming syntax.
            3.  **All Options from Material:** ALL options (both correct and incorrect distractors) MUST be plausible, technical terms, or concepts explicitly found in the reading material.
            4.  **Plausible Distractors:** Incorrect options must be believable and relevant, representing common misunderstandings based on the text.
            5.  **Clarity and Focus:** Each question must present a single, clear problem. Avoid generic or ambiguous questions.
            6.  **Positive Phrasing:** Frame questions positively. Avoid negative or tricky phrasing.
            7.  **Option Consistency:**
                - Provide exactly four (4) options for 'MULTIPLE_CHOICE' and 'MORE_THAN_ONE_MULTIPLE_CHOICE' types.
                - Provide exactly two (2) options ("True", "False") for True/False questions.
                - Ensure all options in a question are of similar length and grammatical structure.
                - Avoid absolute words like 'always' or 'never'.
                - Use "All of the given options" or "None of the given options" instead of "...of the above".
            8.  **Grammar:** Ensure perfect grammar and syntax.
            9.  **Single Skill:** The "skills" array MUST contain exactly ONE string, which is the specific learning outcome being assessed.

            Explanation Guidelines:

Clearly explain why the correct answer is right using only concepts from the reading material.

Briefly contrast with incorrect options without referencing “option 1,” “option 2,” etc.

Use only relevant terminology found in the session or material.

            **Generation Request & Cognitive Distribution:**
            - Mode: ${mode.toUpperCase()}
            - Toughness: ${toughness.toUpperCase()}
            - Cognitive Levels: Strictly generate 70% of questions from the high priority levels and 30% from the low priority levels.
              - High Priority: ${cognitiveLevels.high}
              - Low Priority: ${cognitiveLevels.low}

            **Learning Outcomes to Assess:**
            ---
            ${learningOutcomesText}
            ---

            **Output Schema (Strict):**
            \`\`\`json
            { "mcqs": [ { "core_concept": "string", "question_key": "string", "bloom_level": "string (e.g., APPLYING)", "skills": ["string (MUST contain only ONE most relevant skill)"], "toughness": "${toughness.toUpperCase()}", "question_type": "string (e.g., MULTIPLE_CHOICE, MORE_THAN_ONE_MULTIPLE_CHOICE)", "question": { "content": "string", "content_type": "MARKDOWN" }, "options": [ { "content": "string", "is_correct": true }, { "content": "string", "is_correct": false } ], "explanation_for_answer": { "content": "string" } } ] }
            \`\`\`

            Reading Material to Use:
            ---
            ${readingMaterial}
            ---
        `; 

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const generatedData = JSON.parse(aiResponseText);
       // const savedData = await processAndSaveMcqs(generatedData, req);
        // [MODIFIED] Pass 'learningOutcomes' to the processing function
        const savedData = await processAndSaveMcqs(generatedData, req, learningOutcomes);
        
        res.status(200).json(savedData);
    } catch (err) {
        console.error(`\n❌ An error occurred during ${mode} question generation:`, err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: "An internal server error occurred.", details: err.message });
        }
    }
};


app.post('/generate-practice', handleQuestionGeneration);
 app.post('/generate-exam', handleQuestionGeneration);
// app.post('/generate-code-mcqs', handleCodeQuestionGeneration);




// Add this helper function to the top of your backend file
const getTopicPrefix = (topicName) => {
    const words = topicName.split(' ');
    if (words.length > 1) {
        return words.map(word => word[0]).join('').toUpperCase();
    }
    // Use first 3 letters if it's a single word
    return topicName.substring(0, 3).toUpperCase();
};






///generate-code-mcqs
const handleCodeQuestionGeneration = async (req, res) => {
    const { mainTopic, toughness, readingMaterial, learningOutcomes, mode } = req.body; // added mode
    try {
        if (!mainTopic || !readingMaterial || !learningOutcomes || learningOutcomes.length === 0 || !mode) {
           return res.status(400).json({ error: "Missing required parameters." });
        }

        // const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        // const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // const learningOutcomesText = learningOutcomes.map((lo, i) => `${i + 1}. ${lo}`).join('\n');
        
        // [MODIFIED] Fetch existing questions to get the current count
        const existingDoc = await MCQ.findOne({ mainTopic });
        const baseCodeQuestionCount = existingDoc ? existingDoc.mcqs.filter(q => q.is_base && q.isCode).length : 0;
        const topicPrefix = getTopicPrefix(mainTopic);

        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const learningOutcomesText = learningOutcomes.map((lo, i) => `${i + 1}. ${lo}`).join('\n');
        
        const prompt = `
            You are an expert programming assessment creator. Generate a JSON object with one coding-based question for each learning outcome below.
            **CRITICAL INSTRUCTION: Generate a mix of question types. Approximately 50% should be 'CODE_ANALYSIS_MULTIPLE_CHOICE' and 50% should be 'CODE_ANALYSIS_TEXTUAL'.**
            
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

    2. For 'CODE_ANALYSIS_TEXTUAL':
    **CRITICAL:** The 'options' array MUST contain exactly ONE object. The 'content' field of this object MUST contain the single correct textual answer.
    \`\`\`json
    {
      "core_concept": "string", "question_key": "string", "bloom_level": "string", "skills": ["string"],
      "toughness": "${toughness.toUpperCase()}", "question_type": "CODE_ANALYSIS_TEXTUAL",
      "question": { "content": "string", "code_snippet": "string" },
      "options": [
        { "content": "The single correct string answer goes here", "is_correct": true }
      ],
      "explanation_for_answer": { "content": "string" }
    }
    \`\`\`
    Reading Material to Use:
    ---
    ${readingMaterial}
    ---
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const generatedData = JSON.parse(aiResponseText);
        
        // const finalMcqs = generatedData.mcqs.map(mcq => {
        //     const normalizedConcept = normalizeConcept(mcq.core_concept);
        //     const bloomLevel = mcq.bloom_level || 'UNKNOWN';
        //     const tagNames = [ mainTopic, mcq.question_key, normalizedConcept, bloomLevel, `${bloomLevel.toLowerCase()}_${normalizedConcept}` ];
        //     const { bloom_level, ...restOfMcq } = mcq;
        // --- [MODIFIED] Added 'index' to the map function ---
        const finalMcqs = generatedData.mcqs.map((mcq, index) => {
            const normalizedConcept = normalizeConcept(mcq.core_concept);
            const bloomLevel = mcq.bloom_level || 'UNKNOWN';
            //  // --- [MODIFIED] Replaced the 5th tag with the learning outcome ---
            // const tagNames = [ mainTopic, mcq.question_key, normalizedConcept, bloomLevel, learningOutcomes[index] ];
            
            // const { bloom_level, ...restOfMcq } = mcq;

             // [MODIFIED] Generate the new sequential question key
            const questionNumber = baseCodeQuestionCount + index + 1;
            const formattedNumber = String(questionNumber).padStart(2, '0');
            const newQuestionKey = `${topicPrefix}${formattedNumber}`;

            const tagNames = [ mainTopic, newQuestionKey, normalizedConcept, bloomLevel, learningOutcomes[index] ];
            const { bloom_level, ...restOfMcq } = mcq;


            return {
                ...restOfMcq,
                question_key: newQuestionKey,
                question_id: generateUUID(),
                is_base: true,
                isCode: true,
                mode: mode, // 'practice' or 'exam' passed in body
                language: 'python', // <-- [ADD THIS LINE]
                question: { ...mcq.question, tag_names: tagNames }
            };
        });

        const doc = await MCQ.findOneAndUpdate(
            { mainTopic },
            { $push: { mcqs: { $each: finalMcqs } }, $set: { readingMaterial, updatedAt: new Date() } },
            { upsert: true, new: true }
        );

        res.status(200).json(doc);
    } catch (err) {
        console.error(`❌ POST /generate-code-mcqs - Error for topic "${mainTopic}":`, err.message);
        res.status(500).json({ error: "An internal server error occurred during code question generation.", details: err.message });
    }
};

// --- ENDPOINTS ---
app.post('/generate-practice-code', (req, res) => {
    req.body.mode = 'practice';
    handleCodeQuestionGeneration(req, res);
});

app.post('/generate-exam-code', (req, res) => {
    req.body.mode = 'exam';
    handleCodeQuestionGeneration(req, res);
});



// Generate Standard MCQs Variants Endpoint
app.post('/generate-variants', async (req, res) => {
    const { docId, numVariants } = req.body;
    try {
        const doc = await MCQ.findById(docId);
        if (!doc) { return res.status(404).json({ error: `Document with id ${docId} not found.` }); }

        const baseMcqs = doc.mcqs.filter(mcq => mcq.is_base === true && mcq.isCode === false && mcq.mode === 'practice');
        if (baseMcqs.length === 0) { return res.status(404).json({ error: "No base standard practice MCQs found to create variants from." }); }
        
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

            const prompt = `
                You are an expert assessment creator. Generate ${numVariants} new, distinct variants of the base question provided below.

                **Base Question Details:**
                - Question: ${baseMcq.question.content}
                - Core Concept: ${baseMcq.core_concept}
                - Type-Specific Rules:
                ${variantGenerationRules}

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
                { "mcqs": [{ "core_concept": "${baseMcq.core_concept}", "question_key": "string", "skills": ${JSON.stringify(baseMcq.skills)}, "toughness": "${baseMcq.toughness}", "question_type": "${baseMcq.question_type}", "question": { "content": "string", "content_type": "MARKDOWN", "tag_names": ${JSON.stringify(baseMcq.question.tag_names)} }, "options": [ { "content": "string", "is_correct": true }, { "content": "string", "is_correct": false } ], "explanation_for_answer": { "content": "string" } }] }
                \`\`\`

                Reading Material to Use:
                ---
                ${doc.readingMaterial}
                ---
            `;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const generatedData = JSON.parse(aiResponseText);
            
            if (generatedData && Array.isArray(generatedData.mcqs)) {
                const processedVariants = generatedData.mcqs.map(variant => ({
                    ...variant,
                    core_concept: variant.core_concept || baseMcq.core_concept,
                    question_id: generateUUID(), is_base: false, base_question_id: baseMcq.question_id, isCode: false, mode: 'practice',
                }));
                allNewVariants.push(...processedVariants);
            }
        }
        
        if (allNewVariants.length > 0) {
            doc.mcqs.push(...allNewVariants);
            doc.updatedAt = new Date();
            const savedDoc = await doc.save();
            res.status(200).json(savedDoc);
        } else {
            res.status(200).json({ message: "No new standard variants were generated.", ...doc.toObject() });
        }
    } catch (err) {
        console.error(`\n❌ An error occurred during standard variant generation:`, err.message);
        if (!res.headersSent) { res.status(500).json({ error: "An internal server error occurred.", details: err.message }); }
    }
});


// Generate Code Variants Endpoint
app.post('/generate-code-variants', async (req, res) => {
    const { docId, numVariants } = req.body;
    try {
        const doc = await MCQ.findById(docId);
        if (!doc) { return res.status(404).json({ error: "Document not found." }); }

        const baseCodeMcqs = doc.mcqs.filter(mcq => mcq.is_base === true && mcq.isCode === true);
        if (baseCodeMcqs.length === 0) { return res.status(404).json({ error: "No base code questions found to create variants from." }); }
        
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        let allNewVariants = [];

        for (const baseMcq of baseCodeMcqs) {
             // [MODIFIED] Count variants that already exist for this specific base question
            const existingVariantCount = doc.mcqs.filter(q => !q.is_base && q.base_question_id === baseMcq.question_id).length;
            
            let variantPrompt = '';

            if (baseMcq.question_type === 'CODE_ANALYSIS_TEXTUAL') {
                variantPrompt = `
You are an expert programming assessment creator. The base question is a "fill-in-the-blank" type. Generate ${numVariants} new, distinct variants of it.

Core Rules:
**Strictly** maintain the "CODE_ANALYSIS_TEXTUAL" question type.
The "question_type" for all generated questions (including variants) must be "CODE_ANALYSIS_TEXTUAL".

Variants must test the SAME core concept.

The new code_snippet MUST contain a placeholder like _________.

The question text must never mention “blank” or “fill in the blank.”
The blank (_________) should appear only in the code snippet, not in the question.

All questions must be self-contained — do NOT reference external material.

The "options" array MUST contain exactly ONE object with "is_correct": true.

Use clear, simple, and unambiguous language.
Variant Types to Include (internal generation logic only):

Output Prediction (Textual Fill-in-the-Blank)

Ask learners to predict the output of a given code snippet.

The code may contain a placeholder (_________), but the question itself should not mention it.

Use natural phrasing such as:

What will be the output of the following code?

What is printed when this code is executed?

What will the program display after execution?

Ensure question_type remains "CODE_ANALYSIS_TEXTUAL".

Code Completion (Fill-in-the-Blank)

Ask learners to determine what should replace the blank in the code to achieve a specific output or functionality.

The question should describe the expected behavior or output — not the blank.

Use phrasing such as:

What should replace the missing statement to print ‘Hello World’?

Which expression should be used to display ‘The sum is 30’?

What line should be added to make the code return ‘Success’?

Ensure question_type remains "CODE_ANALYSIS_TEXTUAL".

**Additional Guidelines for Generating Variants:**
- Ensure the code snippet is valid, relevant, and directly related to the core concept.
- The question text must require both the code and the placeholder to answer correctly.
- Avoid tricky, misleading, or ambiguous wording.
- Explanations must clearly state why the answer is correct without referencing external material or the reading session.
- Options should be precise and technically accurate; the correct answer should align perfectly with the intended output or code completion.

**Base Question:**
- Concept: ${baseMcq.core_concept}
- Question: ${baseMcq.question.content}
- Code Snippet: ${baseMcq.question.code_snippet}

**Output Schema (Strict JSON):**
\`\`\`json
{
  "mcqs": [
    {
      "core_concept": "${baseMcq.core_concept}",
      "question_key": "string",
      "skills": ${JSON.stringify(baseMcq.skills)},
      "toughness": "${baseMcq.toughness}",
      "question_type": "CODE_ANALYSIS_TEXTUAL",
      "question": {
        "content": "string",
        "code_snippet": "string with _________",
        "tag_names": ${JSON.stringify(baseMcq.question.tag_names)}
      },
      "options": [
        { "content": "string (the single correct answer)", "is_correct": true }
      ],
      "explanation_for_answer": { "content": "string" }
    }
  ]
}
\`\`\`
`;

            } else { // CODE_ANALYSIS_MULTIPLE_CHOICE
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
1. **Code Analysis – Output Prediction**
   - Ask for the output of the given code.
   - Example: "What is the output of the given code?"
2. **Code Analysis – Output Prediction (True/False)**
   - Ask a true/false question about the code’s output.
   - Example: "The output of the given code is 10. True or False?"
3. **Code Analysis – Error Identification**
   - Ask what error exists in the code.
   - Example: "What error does the given code produce?"
4. **Code Analysis – Error Identification (True/False)**
   - State an error and ask if it’s true or false.
   - Example: "The code will throw a syntax error. True or False?"
5. **Code Analysis – Identify and Fix Error**
   - Ask how to fix an identified error.
   - Example: "How can the given code be corrected?"
6. **Code Analysis – Identify and Fix Error (True/False)**
   - State a possible fix and ask if it’s correct (True/False).
   - Example: "Changing '==' to '=' fixes the error. True or False?"
7. **Code Analysis – Identify Functionality**
   - Ask about the purpose or behavior of the given code.
   - Example: "What is the purpose of the given code snippet?"

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
\`\`\`json
{
  "mcqs": [
    {
      "core_concept": "${baseMcq.core_concept}",
      "question_key": "string",
      "skills": ${JSON.stringify(baseMcq.skills)},
      "toughness": "${baseMcq.toughness}",
      "question_type": "CODE_ANALYSIS_MULTIPLE_CHOICE",
      "question": {
        "content": "string",
        "code_snippet": "string",
        "tag_names": ${JSON.stringify(baseMcq.question.tag_names)}
      },
      "options": [
        { "content": "string", "is_correct": true },
        { "content": "string", "is_correct": false }
      ],
      "explanation_for_answer": { "content": "string" }
    }
  ]
}
\`\`\`
`;

            }
            
            const prompt = `${variantPrompt}
                Reading Material to Use:
                ---
                ${doc.readingMaterial}
                ---
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const aiResponseText = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const generatedData = JSON.parse(aiResponseText);
            
            
             if (generatedData && Array.isArray(generatedData.mcqs)) {
                
                // ==================================================================
                // --- THIS IS THE NEW "CLEAN BUILD" LOGIC ---
                // ==================================================================
                const processed = generatedData.mcqs.map((aiVariant, index) => {
                    // --- Create the sequential key and copy base tags ---
                    const variantNumber = existingVariantCount + index + 1;
                    const newVariantKey = `${baseMcq.question_key}_V${variantNumber}`;
                    const baseTags = baseMcq.question.tag_names;

                    // --- Build the new variant object from scratch ---
                    const newVariantObject = {
                        question_key: newVariantKey,         // Our new sequential key
                        question_id: generateUUID(),
                        base_question_id: baseMcq.question_id,
                        is_base: false,
                        isCode: true,
                        mode: 'practice',
                        
                        // --- Copy consistent fields from the BASE question ---
                        core_concept: baseMcq.core_concept,
                        skills: baseMcq.skills,
                        toughness: baseMcq.toughness,

                        // --- Take only the new content from the AI's response ---
                        question_type: aiVariant.question_type || baseMcq.question_type,
                        question: {
                            content: aiVariant.question.content,
                            code_snippet: aiVariant.question.code_snippet,
                            tag_names: baseTags // Force base tags
                        },
                        options: aiVariant.options,
                        explanation_for_answer: aiVariant.explanation_for_answer
                    };
                    
                    return newVariantObject;
                });
                // ==================================================================

                allNewVariants.push(...processed);
            }
        }
        
        // Use the reliable update method from before
        const updatedMcqsArray = [...doc.mcqs, ...allNewVariants];

        const updatedDoc = await MCQ.findByIdAndUpdate(
            docId,
            { 
                $set: { 
                    mcqs: updatedMcqsArray,
                    updatedAt: new Date()
                } 
            },
            { new: true }
        );

        res.status(200).json(updatedDoc);

    } catch (err) {
        console.error(`❌ POST /generate-code-variants - Error for docId ${docId}:`, err.message);
        res.status(500).json({ error: "An internal server error occurred.", details: err.message });
    }
});

       


// Delete MCQs by Criteria Endpoint
app.post('/mcqs/delete-by-criteria', async (req, res) => {
    const { docId } = req.body;
    console.log(`🚀 POST /mcqs/delete-by-criteria - Request received for docId: ${docId}`);
    console.log('Criteria:', req.body);
    try {
        const { isBase, mode, isCode } = req.body;
        if (!docId) {
            console.warn('⚠️ POST /mcqs/delete-by-criteria - Missing docId.');
            return res.status(400).json({ error: "Missing 'docId'." });
        }

        let pullCriteria = {};
        if (typeof isBase === 'boolean') pullCriteria.is_base = isBase;
        if (mode) pullCriteria.mode = mode;
        if (typeof isCode === 'boolean') pullCriteria.isCode = isCode;

        if (Object.keys(pullCriteria).length === 0) {
            console.warn(`⚠️ POST /mcqs/delete-by-criteria - No criteria provided for docId: ${docId}`);
            return res.status(400).json({ error: "At least one criterion (isBase, mode, isCode) is required." });
        }
        
        const updateResult = await MCQ.updateOne({ _id: docId }, { $pull: { mcqs: pullCriteria } });

        if (updateResult.matchedCount === 0) {
            console.warn(`⚠️ POST /mcqs/delete-by-criteria - Document not found for docId: ${docId}`);
            return res.status(404).json({ error: "Document not found." });
        }
        console.log(`✅ POST /mcqs/delete-by-criteria - Successfully processed deletion for docId: ${docId}. Modified count: ${updateResult.modifiedCount}`);
        res.status(200).json({ message: "Successfully deleted MCQs.", modifiedCount: updateResult.modifiedCount });
    } catch (err) {
        console.error(`❌ POST /mcqs/delete-by-criteria - Error for docId ${docId}:`, err.message);
        res.status(500).json({ error: "An internal server error occurred during deletion.", details: err.message });
    }
});

// Delete Entire Topic Endpoint
app.delete('/topic/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`🚀 DELETE /topic/${id} - Request to delete entire topic.`);
    try {
        await MCQ.findByIdAndDelete(id);
        console.log(`✅ DELETE /topic/${id} - Successfully deleted topic.`);
        res.status(200).json({ message: `Successfully deleted topic.` });
    } catch (err) {
        console.error(`❌ DELETE /topic/${id} - Error:`, err.message);
        res.status(500).json({ error: "An internal server error occurred.", details: err.message });
    }
});

// Download MCQs by Type Endpoints
app.get('/topic/:id/download/exam', async (req, res) => {
    const { id } = req.params;
    console.log(`🚀 GET /topic/${id}/download/exam - Fetching exam questions...`);
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
             return res.status(400).json({ error: "Invalid document ID format." });
        }
        const topicData = await MCQ.findById(id);
        if (!topicData) {
            return res.status(404).json({ error: `Topic with ID ${id} not found.` });
        }

        const examMcqs = topicData.mcqs.filter(q => q.mode === 'exam' && !q.isCode);
        const codeMcqs = topicData.mcqs.filter(q => q.isCode === true && q.is_base === true && q.mode === 'practice');
        
        console.log(`✅ Found ${examMcqs.length} standard exam questions and ${codeMcqs.length} base code questions.`);
        res.status(200).json({ examMcqs, codeMcqs });

    } catch (err) {
        console.error(`❌ GET /topic/${id}/download/exam - Error:`, err.message);
        res.status(500).json({ error: "Failed to fetch exam question data.", details: err.message });
    }
});

// Download Practice Base and Variants Endpoints
app.get('/topic/:id/download/practice-base', async (req, res) => {
    const { id } = req.params;
    console.log(`🚀 GET /topic/${id}/download/practice-base - Fetching practice base questions...`);
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
             return res.status(400).json({ error: "Invalid document ID format." });
        }
        const topicData = await MCQ.findById(id);
        if (!topicData) {
            return res.status(404).json({ error: `Topic with ID ${id} not found.` });
        }

        const practiceBaseMcqs = topicData.mcqs.filter(q => q.mode === 'practice' && q.is_base === true && q.isCode === false);

        console.log(`✅ Found ${practiceBaseMcqs.length} practice base questions.`);
        res.status(200).json({ mcqs: practiceBaseMcqs });

    } catch (err) {
        console.error(`❌ GET /topic/${id}/download/practice-base - Error:`, err.message);
        res.status(500).json({ error: "Failed to fetch practice base question data.", details: err.message });
    }
});

app.get('/topic/:id/download/practice-variants', async (req, res) => {
    const { id } = req.params;
    console.log(`🚀 GET /topic/${id}/download/practice-variants - Fetching practice variant questions...`);
    try {
         if (!mongoose.Types.ObjectId.isValid(id)) {
             return res.status(400).json({ error: "Invalid document ID format." });
        }
        const topicData = await MCQ.findById(id);
        if (!topicData) {
            return res.status(404).json({ error: `Topic with ID ${id} not found.` });
        }

        const practiceVariantMcqs = topicData.mcqs.filter(q => q.mode === 'practice' && q.is_base === false);
        
        console.log(`✅ Found ${practiceVariantMcqs.length} practice variant questions.`);
        res.status(200).json({ mcqs: practiceVariantMcqs });

    } catch (err) {
        console.error(`❌ GET /topic/${id}/download/practice-variants - Error:`, err.message);
        res.status(500).json({ error: "Failed to fetch practice variant question data.", details: err.message });
    }
});

// Update Single MCQ Endpoint
app.put('/topic/:docId/mcq/:questionId', async (req, res) => {
    const { docId, questionId } = req.params;
    const updatedMcqData = req.body;
    console.log(`🚀 PUT /topic/${docId}/mcq/${questionId} - Request to update an MCQ.`);

    try {
        if (!mongoose.Types.ObjectId.isValid(docId)) {
            return res.status(400).json({ error: "Invalid document ID format." });
        }

        if (updatedMcqData.question_id !== questionId) {
            return res.status(400).json({ error: "Question ID in URL and body do not match." });
        }

        const topic = await MCQ.findById(docId);
        if (!topic) {
            return res.status(404).json({ error: 'Topic document not found.' });
        }

        const mcqIndex = topic.mcqs.findIndex(mcq => mcq.question_id === questionId);
        if (mcqIndex === -1) {
            return res.status(404).json({ error: 'MCQ with the specified question_id not found in this topic.' });
        }

        topic.mcqs[mcqIndex] = updatedMcqData;
        topic.updatedAt = new Date(); 

        const savedTopic = await topic.save();
        
        console.log(`✅ PUT /topic/${docId}/mcq/${questionId} - Successfully updated the MCQ.`);
        
        res.status(200).json(savedTopic);

    } catch (err) {
        console.error(`❌ PUT /topic/${docId}/mcq/${questionId} - Error:`, err.message);
        res.status(500).json({ error: 'Failed to update MCQ.', details: err.message });
    }
});

// Delete Single MCQ Endpoint
app.delete('/topic/:docId/mcq/:questionId', async (req, res) => {
    const { docId, questionId } = req.params;
    console.log(`🚀 DELETE /topic/${docId}/mcq/${questionId} - Request to delete a single MCQ.`);

    try {
        if (!mongoose.Types.ObjectId.isValid(docId)) {
            return res.status(400).json({ error: "Invalid document ID format." });
        }

        const updatedTopic = await MCQ.findOneAndUpdate(
            { _id: docId },
            { $pull: { mcqs: { question_id: questionId } } },
            { new: true }
        );

        if (!updatedTopic) {
             const topicExists = await MCQ.findById(docId);
             if (!topicExists) {
                 return res.status(404).json({ error: 'Topic document not found.' });
             }
             return res.status(404).json({ error: 'MCQ with the specified question_id not found.' });
        }

        console.log(`✅ DELETE /topic/${docId}/mcq/${questionId} - Successfully deleted the MCQ.`);
        res.status(200).json(updatedTopic);

    } catch (err) {
        console.error(`❌ DELETE /topic/${docId}/mcq/${questionId} - Error:`, err.message);
        res.status(500).json({ error: 'Failed to delete MCQ.', details: err.message });
    }
});


// --- API Endpoints ---
// ... (all your existing endpoints) ...

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














// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
