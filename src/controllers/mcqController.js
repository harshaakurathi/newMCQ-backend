// src/controllers/mcqController.js
const Subject = require("../../models/mcqModel.js");

// GET /topic/:topicId/mcqs
exports.getMcqsForTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const subject = await Subject.findOne(
      { "topics._id": topicId },
      { "topics.$": 1 }
    );
    if (!subject || !subject.topics.length) {
      return res.status(404).json({ error: "Topic not found" });
    }
    const topic = subject.topics[0];
    const allMcqs = topic.units.reduce(
      (acc, unit) => acc.concat(unit.mcqs),
      []
    );
    res.status(200).json({ mcqs: allMcqs });
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Failed to retrieve MCQs for the topic.",
        details: err.message,
      });
  }
};

// DELETE /unit/mcqs-by-filter

exports.deleteMcqsByFilter = async (req, res) => {
  const { subjectName, topicName, unitName, filter } = req.body;
  console.log(
    `🚀 DELETE /unit/mcqs-by-filter - Deleting '${filter}' MCQs from ${unitName}`
  );
  try {
    const subject = await Subject.findOne({ subject_name: subjectName });
    if (!subject) return res.status(404).json({ error: "Subject not found." });

    const topic = subject.topics.find((t) => t.topic_name === topicName);
    if (!topic) return res.status(404).json({ error: "Topic not found." });

    const unit = topic.units.find((u) => u.unit_name === unitName);
    if (!unit) return res.status(404).json({ error: "Unit not found." });

    const mcqsToKeep = unit.mcqs.filter((mcq) => {
      switch (filter) {
        // Combined Views (Keep if NOT matching)
        case "practice-base-all":
          return !(mcq.mode === "practice" && mcq.is_base);
        case "practice-variants-all":
          return !(mcq.mode === "practice" && !mcq.is_base);
        case "practice-all":
          return !(mcq.mode === "practice");
        case "exam": // This filter means "Exam - All Base" in your frontend dropdown
          return !(mcq.mode === "exam" && mcq.is_base); // Keep if NOT exam base

        // Individual Filters (Keep if NOT matching)
        case "practice-base":
          return !(mcq.mode === "practice" && mcq.is_base && !mcq.isCode);
        case "practice-variants":
          return !(mcq.mode === "practice" && !mcq.is_base && !mcq.isCode);
        case "code-base":
          return !(mcq.mode === "practice" && mcq.is_base && mcq.isCode);
        case "code-variants":
          return !(mcq.mode === "practice" && !mcq.is_base && mcq.isCode);
        case "exam-mcq":
          return !(mcq.mode === "exam" && !mcq.isCode);
        case "exam-code":
          return !(mcq.mode === "exam" && mcq.isCode);

        default:
          return true; // Keep everything if filter is unknown (shouldn't happen)
      }
    });

    const numDeleted = unit.mcqs.length - mcqsToKeep.length;
    if (numDeleted === 0) {
      return res
        .status(200)
        .json({ message: "No MCQs matched the filter to delete." });
    } // --- [NEW LOGIC] --- // Get all unique learning outcomes from the *remaining* MCQs

    const remainingOutcomes = new Set(
      mcqsToKeep.flatMap((mcq) => mcq.skills || [])
    ); // Update the unit's learning outcomes to only include those that are still in use
    unit.learningOutcomes = unit.learningOutcomes.filter((lo) =>
      remainingOutcomes.has(lo)
    );
    console.log(
      `🧹 Cleaned unit learning outcomes. ${unit.learningOutcomes.length} outcomes remain.`
    ); // --- [END NEW LOGIC] ---
    unit.mcqs = mcqsToKeep; // Replace the old array with the filtered one
    subject.updatedAt = new Date();
    const savedSubject = await subject.save();

    console.log(`✅ Successfully deleted ${numDeleted} MCQs based on filter.`);
    res.status(200).json(savedSubject);
  } catch (err) {
    console.error("❌ DELETE /unit/mcqs-by-filter - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to bulk delete MCQs.", details: err.message });
  }
};
// DELETE /unit/mcq

exports.deleteMcqById = async (req, res) => {
  const { subjectName, topicName, unitName, questionId } = req.body;
  console.log(`🚀 DELETE /unit/mcq - Request to delete MCQ ${questionId}`);
  try {
    const subject = await Subject.findOne({ subject_name: subjectName });
    if (!subject) return res.status(404).json({ error: "Subject not found." });

    const topic = subject.topics.find((t) => t.topic_name === topicName);
    if (!topic) return res.status(404).json({ error: "Topic not found." });

    const unit = topic.units.find((u) => u.unit_name === unitName);
    if (!unit) return res.status(404).json({ error: "Unit not found." });

    const mcqIndex = unit.mcqs.findIndex(
      (mcq) => mcq.question_id === questionId
    );
    if (mcqIndex === -1)
      return res.status(404).json({ error: "MCQ not found." }); // --- [NEW LOGIC] --- // Get the MCQ that is about to be deleted

    const deletedMcq = unit.mcqs[mcqIndex]; // Get its learning outcome (assuming it's in skills[0])
    const deletedOutcome = deletedMcq?.skills?.[0]; // Remove the MCQ from the array

    unit.mcqs.splice(mcqIndex, 1); // If the deleted MCQ had a learning outcome...

    if (deletedOutcome) {
      // Check if any *other* MCQ in the array still uses this outcome
      const isOutcomeStillUsed = unit.mcqs.some((mcq) =>
        mcq.skills?.includes(deletedOutcome)
      ); // If no other MCQ uses it, remove it from the unit's learningOutcomes list

      if (!isOutcomeStillUsed) {
        console.log(
          `🧹 Cleaning up orphaned learning outcome: ${deletedOutcome}`
        );
        unit.learningOutcomes = unit.learningOutcomes.filter(
          (lo) => lo !== deletedOutcome
        );
      }
    } // --- [END NEW LOGIC] ---
    subject.updatedAt = new Date();
    const savedSubject = await subject.save();

    console.log(`✅ Successfully deleted MCQ.`);
    res.status(200).json(savedSubject);
  } catch (err) {
    console.error("❌ DELETE /unit/mcq - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to delete MCQ.", details: err.message });
  }
};

// PUT /unit/mcq
exports.updateMcqById = async (req, res) => {
  const { subjectName, topicName, unitName, updatedMcq } = req.body;
  console.log(
    `🚀 PUT /unit/mcq - Request to update MCQ ${updatedMcq.question_id}`
  );
  try {
    const subject = await Subject.findOne({ subject_name: subjectName });
    if (!subject) return res.status(404).json({ error: "Subject not found." });

    const topic = subject.topics.find((t) => t.topic_name === topicName);
    if (!topic) return res.status(404).json({ error: "Topic not found." });

    const unit = topic.units.find((u) => u.unit_name === unitName);
    if (!unit) return res.status(404).json({ error: "Unit not found." });
    const mcqIndex = unit.mcqs.findIndex(
      (mcq) => mcq.question_id === updatedMcq.question_id
    );
    if (mcqIndex === -1)
      return res.status(404).json({ error: "MCQ not found." });

    unit.mcqs[mcqIndex] = updatedMcq;
    subject.updatedAt = new Date();
    const savedSubject = await subject.save();
    console.log(`✅ PUT /unit/mcq - Successfully updated MCQ.`);
    res.status(200).json(savedSubject);
  } catch (err) {
    console.error(`❌ PUT /unit/mcq - Error:`, err.message);
    res
      .status(500)
      .json({ error: "Failed to update MCQ.", details: err.message });
  }
};
