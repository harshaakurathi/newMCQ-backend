


const mongoose = require('mongoose');

// Schema for individual options within a question (NO CHANGE)
const optionSchema = new mongoose.Schema({
    content: String,
    is_correct: Boolean
}, { _id: false });

// Schema for the question content itself (NO CHANGE)
const questionContentSchema = new mongoose.Schema({
    content: String,
    code_snippet: String,
    content_type: { type: String, default: 'MARKDOWN' },
    tag_names: [String]
}, { _id: false });

// Schema for a single Multiple Choice Question (MCQ) (NO CHANGE)
const mcqItemSchema = new mongoose.Schema({
    question_id: { type: String, unique: true, sparse: true },
    is_base: Boolean,
    base_question_id: { type: String, required: false },
    isCode: { type: Boolean, default: false },
    language: { type: String, default: 'python' },
    mode: String,
    core_concept: String,
    question_key: String,
    skills: [String],
    toughness: String,
    question_type: { type: String, default: 'MULTIPLE_CHOICE' },
    question: questionContentSchema,
    options: [optionSchema],
    explanation_for_answer: { content: String }
}, { _id: false });


// --- [NEW] HIERARCHICAL SCHEMAS ---

// A 'Unit' holds the actual content and questions
const unitSchema = new mongoose.Schema({
    unit_name: { type: String, required: true },
    readingMaterial: { type: String, required: true },
    learningOutcomes: { type: [String], default: [] },
    mcqs: [mcqItemSchema]
});

// A 'Topic' is a collection of Units
const topicSchema = new mongoose.Schema({
    topic_name: { type: String, required: true },
    units: [unitSchema]
});

// The main document is now a 'Subject', which is a collection of Topics
const subjectSchema = new mongoose.Schema({
    subject_name: {
        type: String,
        required: true,
        unique: true
    },
    topics: [topicSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// The model should be named after the top-level schema
module.exports = mongoose.model('Subject', subjectSchema);
