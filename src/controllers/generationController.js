// src/controllers/generationController.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Subject = require("../../models/mcqModel.js");
const {
  generateUUID,
  normalizeConcept,
  getTopicPrefix,
} = require("../utils/helpers");

// POST /generate-learning-outcomes
exports.generateLearningOutcomes = async (req, res) => {
  console.log("🚀 POST /generate-learning-outcomes - Request received.");
  try {
    const { readingMaterial } = req.body;
    if (!readingMaterial) {
      console.error(
        "❌ POST /generate-learning-outcomes - Error: Missing readingMaterial."
      );
      return res.status(400).json({ error: "readingMaterial is required." });
    }
    console.log("🤖 Calling Gemini API for standard learning outcomes...");
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
    const aiResponseText = response
      .text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const generatedData = JSON.parse(aiResponseText);
    console.log(
      `✅ POST /generate-learning-outcomes - Successfully generated ${generatedData.learning_outcomes.length} outcomes.`
    );
    res.status(200).json(generatedData);
  } catch (err) {
    console.error("❌ POST /generate-learning-outcomes - Error:", err.message);
    res
      .status(500)
      .json({
        error: "Failed to generate learning outcomes.",
        details: err.message,
      });
  }
};

// POST /generate-code-outcomes
exports.generateCodeOutcomes = async (req, res) => {
  console.log("🚀 POST /generate-code-outcomes - Request received.");
  try {
    const { readingMaterial } = req.body;
    console.log("🤖 Calling Gemini API for CODE-SPECIFIC learning outcomes...");
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
    const aiResponseText = response
      .text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const generatedData = JSON.parse(aiResponseText);
    console.log(
      `✅ POST /generate-code-outcomes - Successfully generated ${generatedData.learning_outcomes.length} code outcomes.`
    );
    res.status(200).json(generatedData);
  } catch (err) {
    console.error("❌ POST /generate-code-outcomes - Error:", err.message);
    res
      .status(500)
      .json({
        error: "Failed to generate code learning outcomes.",
        details: err.message,
      });
  }
};

// POST /generate-practice, /generate-exam, etc.
exports.handleQuestionGeneration = async (req, res) => {
  const isCode = req.path.includes("code");
  const mode = req.path.includes("practice") ? "practice" : "exam";
  const {
    subjectName,
    topicName,
    unitName,
    toughness,
    readingMaterial,
    learningOutcomes,
  } = req.body;

  if (
    !subjectName ||
    !topicName ||
    !unitName ||
    !toughness ||
    !readingMaterial ||
    !learningOutcomes
  ) {
    return res
      .status(400)
      .json({ error: "Missing required parameters for question generation." });
  }
  console.log(
    `🚀 Generating ${mode} ${
      isCode ? "code" : "standard"
    } questions for ${subjectName}/${topicName}/${unitName}`
  );

  try {
    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const learningOutcomesText = learningOutcomes
      .map((lo, i) => `${i + 1}. ${lo}`)
      .join("\n");
    let prompt;
    if (isCode) {
      // ... (Your long code prompt) ...
      let cognitiveLevels;
      if (mode === "practice") {
        cognitiveLevels = {
          high: "REMEMBERING, UNDERSTANDING, ANALYZING, EVALUATING",
          low: "APPLYING",
        };
      } else {
        // mode === 'exam'
        cognitiveLevels = {
          high: "APPLYING",
          low: "REMEMBERING, UNDERSTANDING, ANALYZING, EVALUATING",
        };
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
      // ... (Your long standard prompt) ...
      const cognitiveLevels = {
        low: "APPLYING, ANALYZING, EVALUATING",
        high: "REMEMBERING, UNDERSTANDING",
      };

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
    const aiResponseText = response
      .text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const generatedData = JSON.parse(aiResponseText);
    const subjectForCount = await Subject.findOne({
      subject_name: subjectName,
    });
    const topicForCount = subjectForCount?.topics.find(
      (t) => t.topic_name === topicName
    );
    const unitForCount = topicForCount?.units.find(
      (u) => u.unit_name === unitName
    );
    const baseQuestionCount = unitForCount
      ? unitForCount.mcqs.filter((q) => q.is_base).length
      : 0;
    const topicPrefix = getTopicPrefix(topicName);

    const newMcqs = generatedData.mcqs.map((mcq, index) => {
      const normalizedConcept = normalizeConcept(mcq.core_concept);
      const bloomLevel = mcq.bloom_level || "UNKNOWN";
      const questionNumber = baseQuestionCount + index + 1;
      const formattedNumber = String(questionNumber).padStart(2, "0");
      const newQuestionKey = `${topicPrefix}${formattedNumber}`;
      const currentLearningOutcome = learningOutcomes[index] || "";
      const tagNames = [
        unitName,
        newQuestionKey,
        normalizedConcept,
        bloomLevel,
        currentLearningOutcome,
      ];
      const { bloom_level, ...restOfMcq } = mcq;

      return {
        ...restOfMcq,
        skills: [currentLearningOutcome],
        question_key: newQuestionKey,
        question_id: generateUUID(),
        mode,
        is_base: true,
        isCode,
        question: { ...mcq.question, tag_names: tagNames },
      };
    });

    let subject = await Subject.findOne({ subject_name: subjectName });
    if (!subject) {
      subject = await Subject.create({ subject_name: subjectName, topics: [] });
    }
    let topic = subject.topics.find((t) => t.topic_name === topicName);
    if (!topic) {
      subject.topics.push({ topic_name: topicName, units: [] });
      topic = subject.topics[subject.topics.length - 1];
    }
    let unit = topic.units.find((u) => u.unit_name === unitName);
    if (!unit) {
      topic.units.push({
        unit_name: unitName,
        readingMaterial,
        learningOutcomes,
        mcqs: newMcqs,
      });
    } else {
      unit.readingMaterial = readingMaterial;
      unit.learningOutcomes = [
        ...new Set([...unit.learningOutcomes, ...learningOutcomes]),
      ];
      unit.mcqs.push(...newMcqs);
    }
    subject.updatedAt = new Date();
    const savedSubject = await subject.save();
    console.log(`✅ Successfully saved ${newMcqs.length} MCQs.`);
    res.status(200).json(savedSubject);
  } catch (err) {
    console.error(`❌ Error during question generation:`, err.stack);
    res
      .status(500)
      .json({
        error: "An internal server error occurred during generation.",
        details: err.message,
      });
  }
};

// POST /unit/generate-variants
exports.handleStandardVariantGeneration = async (req, res) => {
  const { subjectName, topicName, unitName, numVariants } = req.body;
  console.log(
    `🚀 Generating standard variants for ${subjectName}/${topicName}/${unitName}`
  );
  try {
    const subject = await Subject.findOne({ subject_name: subjectName });
    if (!subject) return res.status(404).json({ error: "Subject not found." });
    const topic = subject.topics.find((t) => t.topic_name === topicName);
    if (!topic) return res.status(404).json({ error: "Topic not found." });
    const unit = topic.units.find((u) => u.unit_name === unitName);
    if (!unit) return res.status(404).json({ error: "Unit not found." });
    const baseMcqs = unit.mcqs.filter(
      (mcq) => mcq.is_base === true && !mcq.isCode && mcq.mode === "practice"
    );
    if (baseMcqs.length === 0) {
      return res
        .status(404)
        .json({
          error: `No base standard practice questions found to generate variants from.`,
        });
    }

    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    let allNewVariants = [];

    for (const baseMcq of baseMcqs) {
      // ... (Your variant logic and prompt) ...
      let variantGenerationRules = "...";
      if (
        baseMcq.options.length === 2 &&
        baseMcq.options.some((o) => o.content.toLowerCase() === "true")
      ) {
        variantGenerationRules = `- This is a True/False question. The variants must also be True/False questions with exactly two options: "True" and "False".`;
      } else if (baseMcq.options.filter((o) => o.is_correct).length > 1) {
        variantGenerationRules = `- This is a 'MORE_THAN_ONE_MULTIPLE_CHOICE' question. The variants must also have multiple correct answers out of four options.`;
      } else {
        variantGenerationRules = `- This is a standard 'MULTIPLE_CHOICE' question. The variants must also have exactly one correct answer out of four options.`;
      } // ...
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
3. Generate True/False questions as statements only — don’t include words like “True or False” or “T/F” in the question.
✅ Example: “The mv command can rename directories.”
❌ Not: “True or False: The mv command can rename directories.”
4.must give  **Statement-Based** – e.g.,
   Statement I: mv can rename a file.
   Statement II: mv cannot move directories.
   Options:
   A) Only Statement I is true  
   B) Only Statement II is true  
   C) Both Statements are true  
   D) Both Statements are false
5. must give **Fill in the Blank** – e.g., “The command used to delete a directory and its contents is \_\_\_\_\_\_\_\_.”
Must give Fill in the Blank questions using underscores exactly like this — \_\_\_\_\_\_\_\_ — not plain dashes or spaces.

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
                { "mcqs": [{ "core_concept": "${
                  baseMcq.core_concept
                }", "question_key": "string", "skills": ${JSON.stringify(
        baseMcq.skills
      )}, "toughness": "${
        baseMcq.toughness
      }", "question_type": "string", "question": { "content": "string", "content_type": "MARKDOWN", "tag_names": ${JSON.stringify(
        baseMcq.question.tag_names
      )} }, "options": [ { "content": "string", "is_correct": true }, { "content": "string", "is_correct": false } ], "explanation_for_answer": { "content": "string" } }] }
                \`\`\`

                Reading Material to Use:
                ---
                ${unit.readingMaterial}
                ---
            `;
      const result = await model.generateContent(variantPrompt);
      const response = await result.response;
      const aiResponseText = response
        .text()
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      const generatedData = JSON.parse(aiResponseText);

      if (generatedData && Array.isArray(generatedData.mcqs)) {
        const processedVariants = generatedData.mcqs.map((variant, index) => {
          // Get the base question's key (e.g., "OP10")
          const baseKey = baseMcq.question_key; // Create the new variant key (e.g., "OP10_V1")
          const variantKey = `${baseKey}_V${index + 1}`; // Get the tags from the AI (which should match the base question's)
          const originalTags = variant.question?.tag_names || []; // Create new tags by replacing the baseKey with the new variantKey

          const newTags = originalTags.map((tag) =>
            tag === baseKey ? variantKey : tag
          ); // Safety check: If the baseKey wasn't found, add the new key anyway
          if (
            !originalTags.includes(baseKey) &&
            !newTags.includes(variantKey)
          ) {
            newTags.push(variantKey);
          }

          return {
            ...variant,
            question_id: generateUUID(),
            is_base: false,
            base_question_id: baseMcq.question_id,
            isCode: false,
            mode: "practice",
            language: baseMcq.language,
            question: {
              // Update the question sub-document
              ...variant.question,
              tag_names: newTags,
            },
          };
        });
        allNewVariants.push(...processedVariants);
      }
    }
    if (allNewVariants.length > 0) {
      unit.mcqs.push(...allNewVariants);
      subject.updatedAt = new Date();
      const savedSubject = await subject.save();
      console.log(
        `✅ Generated and saved ${allNewVariants.length} standard variants.`
      );
      res.status(200).json(savedSubject);
    } else {
      res
        .status(200)
        .json({ message: "No new standard variants were generated." });
    }
  } catch (err) {
    console.error(`❌ Error during standard variant generation:`, err);
    res
      .status(500)
      .json({
        error: "An internal server error during standard variant generation.",
        details: err.message,
      });
  }
};

// POST /unit/generate-code-variants
exports.handleCodeVariantGeneration = async (req, res) => {
  const { subjectName, topicName, unitName, numVariants } = req.body;
  console.log(
    `🚀 Generating code variants for ${subjectName}/${topicName}/${unitName}`
  );
  try {
    const subject = await Subject.findOne({ subject_name: subjectName });
    if (!subject) return res.status(404).json({ error: "Subject not found." });
    const topic = subject.topics.find((t) => t.topic_name === topicName);
    if (!topic) return res.status(404).json({ error: "Topic not found." });
    const unit = topic.units.find((u) => u.unit_name === unitName);
    if (!unit) return res.status(404).json({ error: "Unit not found." });
    const baseMcqs = unit.mcqs.filter(
      (mcq) =>
        mcq.is_base === true && mcq.isCode === true && mcq.mode === "practice"
    );
    if (baseMcqs.length === 0) {
      return res
        .status(404)
        .json({
          error: `No base code practice questions found to generate variants from.`,
        });
    }

    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    let allNewVariants = [];

    for (const baseMcq of baseMcqs) {
      // ... (Your code variant logic and prompt) ...
      let variantPrompt = `
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
                    { "mcqs": [ { "core_concept": "${
                      baseMcq.core_concept
                    }", "question_key": "string", "skills": ${JSON.stringify(
        baseMcq.skills
      )}, "toughness": "${
        baseMcq.toughness
      }", "question_type": "CODE_ANALYSIS_MULTIPLE_CHOICE", "question": { "content": "string", "code_snippet": "string", "tag_names": ${JSON.stringify(
        baseMcq.question.tag_names
      )} }, "options": [ { "content": "string", "is_correct": true }, { "content": "string", "is_correct": false } ], "explanation_for_answer": { "content": "string" } } ] }
                    \`\`\`
                    2. FOR CODE_ANALYSIS_TEXTUAL:
                    \`\`\`json
                    { "mcqs": [ { "core_concept": "${
                      baseMcq.core_concept
                    }", "question_key": "string", "skills": ${JSON.stringify(
        baseMcq.skills
      )}, "toughness": "${
        baseMcq.toughness
      }", "question_type": "CODE_ANALYSIS_TEXTUAL", "question": { "content": "string", "code_snippet": "string with _________", "tag_names": ${JSON.stringify(
        baseMcq.question.tag_names
      )} }, "options": [ { "content": "string (the single correct answer)", "is_correct": true }   ], "explanation_for_answer": { "content": "string" } } ] }
                    \`\`\`
                `;
      const finalPrompt = `${variantPrompt}\nReading Material to Use:\n---\n${unit.readingMaterial}\n---`;

      const result = await model.generateContent(finalPrompt);
      const response = await result.response;
      const aiResponseText = response
        .text()
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      const generatedData = JSON.parse(aiResponseText);

      if (generatedData && Array.isArray(generatedData.mcqs)) {
        const processedVariants = generatedData.mcqs.map((variant, index) => {
          // Get the base question's key (e.g., "OP10")
          const baseKey = baseMcq.question_key; // Create the new variant key (e.g., "OP10_V1")
          const variantKey = `${baseKey}_V${index + 1}`; // Get the tags from the AI (which should match the base question's)
          const originalTags = variant.question?.tag_names || []; // Create new tags by replacing the baseKey with the new variantKey

          const newTags = originalTags.map((tag) =>
            tag === baseKey ? variantKey : tag
          ); // Safety check: If the baseKey wasn't found, add the new key anyway
          if (
            !originalTags.includes(baseKey) &&
            !newTags.includes(variantKey)
          ) {
            newTags.push(variantKey);
          }
          return {
            ...variant,
            question_id: generateUUID(),
            is_base: false,
            base_question_id: baseMcq.question_id,
            isCode: true,
            mode: "practice",
            language: baseMcq.language, // Inherit language
            question: {
              // Update the question sub-document
              ...variant.question,
              tag_names: newTags,
            },
          };
          Example;
        });
        allNewVariants.push(...processedVariants);
      }
    }
    if (allNewVariants.length > 0) {
      unit.mcqs.push(...allNewVariants);
      subject.updatedAt = new Date();
      const savedSubject = await subject.save();
      console.log(
        `✅ Generated and saved ${allNewVariants.length} code variants.`
      );
      res.status(200).json(savedSubject);
    } else {
      res.status(200).json({ message: "No new code variants were generated." });
    }
  } catch (err) {
    console.error(`❌ Error during code variant generation:`, err);
    res
      .status(500)
      .json({
        error: "An internal server error during code variant generation.",
        details: err.message,
      });
  }
};
