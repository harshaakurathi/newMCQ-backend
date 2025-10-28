const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const crypto = require('crypto');

// Load environment variables from a .env file in the same directory as the script
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Dynamically import the ES Module-based Google AI library
let GoogleGenerativeAI;
const importAI = async () => {
    try {
        const module = await import('@google/generative-ai');
        GoogleGenerativeAI = module.GoogleGenerativeAI;
    } catch (error) {
        console.error("❌ Failed to load the '@google/generative-ai' module. Please ensure it is installed (`npm install @google/generative-ai`).");
        process.exit(1);
    }
};

// Assuming your DB and Model files are in their respective directories and use CommonJS
const connectDB = require('../db/mongo');
const MCQ = require('../models/mcqModel');

/**
 * Parses the input configuration file which uses a '---' separator.
 * @param {string} fileContent The content of the input.txt file.
 * @returns {object} A configuration object with all parameters.
 */
function parseInputFile(fileContent) {
    const parts = fileContent.split('---');
    if (parts.length < 2) {
        throw new Error("Invalid input file format: Missing '---' separator between parameters and reading material.");
    }

    const config = {};
    const paramsPart = parts[0];
    config.readingMaterial = parts.slice(1).join('---').trim();

    paramsPart.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            const [key, ...valueParts] = trimmedLine.split(':');
            const value = valueParts.join(':').trim();
            if (key && value) {
                config[key.trim()] = value;
            }
        }
    });

    if (!config.mainTopic || !config.numberOfQuestions || !config.readingMaterial) {
        throw new Error("Input file is missing required parameters like 'mainTopic', 'numberOfQuestions', or the reading material section after '---'.");
    }
    return config;
}

/**
 * Generates a unique UUID for question IDs.
 * @returns {string} A version 4 UUID.
 */
function generateUUID() {
    return crypto.randomUUID();
}

/**
 * Main function to generate MCQs and save them to the database.
 */
const importMCQs = async () => {
    try {
        const args = process.argv.slice(2);
        if (args.length !== 1) {
            console.error("\nUsage: node importMCQs.js <path_to_input_file>");
            console.error("Example: node importMCQs.js ./input.txt\n");
            process.exit(1);
        }

        await importAI();
        if (!process.env.API_KEY) {
            throw new Error("API_KEY not found in .env file. Please ensure it is set.");
        }
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);

        const filePath = args[0];
        console.log(`📄 Reading configuration from: ${filePath}`);
        const fileContent = await fs.readFile(filePath, "utf-8");
        const config = parseInputFile(fileContent);

        // --- UPDATED PROMPT ---
        // Added a clear 'json_schema' example to guide the AI's output format.
        const prompt = `
            Based on the provided reading material, generate a JSON object for a quiz.
            **Instructions:**
            1.  The output must be a single, raw JSON object. Do not wrap it in markdown.
            2.  Generate exactly ${config.numberOfQuestions} questions.
            3.  Set toughness to: ${config.toughness}.
            4.  Set 'is_base' for each question to: ${config.isBase === 'true'}.
            5.  Determine the 'subTopic' for each question from the material.
            6.  The final JSON must strictly follow this schema:
                \`\`\`json
                {
                  "mainTopic": "${config.mainTopic}",
                  "mcqs": [
                    {
                      "is_base": boolean,
                      "question_key": "string",
                      "skills": [],
                      "toughness": "EASY|MEDIUM|HARD",
                      "question_type": "MULTIPLE_CHOICE|TRUE_FALSE|FILL_IN_THE_BLANK",
                      "subTopic": "string",
                      "question": { "content": "string", "content_type": "MARKDOWN", "tag_names": ["string"], "multimedia": [] },
                      "options": [{ "content": "string", "is_correct": boolean }],
                      "explanation_for_answer": { "content": "string", "content_type": "MARKDOWN" }
                    }
                  ]
                }
                \`\`\`
            
            **Reading Material:**
            ---
            ${config.readingMaterial}
            ---
        `;

        console.log("🤖 Calling Gemini API to generate MCQs... Please wait.");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponseText = response.text();
        
        const cleanedText = aiResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const generatedData = JSON.parse(cleanedText);
        console.log(generatedData);

        // --- ADDED ERROR HANDLING ---
        // This check validates the AI's response before trying to use it.
        if (!generatedData || !Array.isArray(generatedData.mcqs)) {
            console.error("\n❌ AI response is not in the expected format. The 'mcqs' array is missing.");
            console.error("Raw AI Response:", cleanedText);
            throw new Error("Invalid data structure received from AI.");
        }

        const finalMcqData = {
            ...generatedData,
            readingMaterial: config.readingMaterial,
            mode: config.mode,
            mcqs: generatedData.mcqs.map(mcq => ({ ...mcq, question_id: generateUUID() })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        console.log("💾 Connecting to the database...");
        await connectDB();
        
        const { mainTopic, mcqs, readingMaterial } = finalMcqData;
        console.log(`🔍 Checking for existing topic: "${mainTopic}"...`);
        let existingDoc = await MCQ.findOne({ mainTopic });

        if (existingDoc) {
            const existingQuestionIds = new Set(existingDoc.mcqs.map(q => q.question_id));
            const newMcqs = mcqs.filter(q => !existingQuestionIds.has(q.question_id));
            if (newMcqs.length > 0) {
                existingDoc.mcqs.push(...newMcqs);
                existingDoc.readingMaterial += "\n\n---\n\n" + readingMaterial;
                existingDoc.updatedAt = new Date();
                await existingDoc.save();
                console.log(`✅ ${newMcqs.length} new MCQs appended to existing topic: ${mainTopic}`);
            } else {
                console.log(`ℹ️ No new unique MCQs were generated to add to the topic.`);
            }
        } else {
            console.log(`✨ Creating new topic: "${mainTopic}"...`);
            const newDoc = await MCQ.create(finalMcqData);
            console.log(`✅ New topic created successfully, DB ID: ${newDoc._id}`);
        }

    } catch (err) {
        console.error('\n❌ An error occurred during the process:', err.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log("\n🔌 Database connection closed.");
        process.exit(0);
    }
};

importMCQs();

