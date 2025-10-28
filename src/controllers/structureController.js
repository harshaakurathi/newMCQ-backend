// src/controllers/structureController.js
const Subject = require("../../models/mcqModel"); // Adjust path as needed

// GET /subjects
exports.getAllSubjects = async (req, res) => {
  console.log("🚀 GET /subjects - Fetching all subjects...");
  try {
    const subjects = await Subject.find(
      {},
      "subject_name topics.topic_name topics.units.unit_name"
    );
    console.log(
      `✅ GET /subjects - Successfully fetched ${subjects.length} subjects.`
    );
    res.status(200).json(subjects);
  } catch (err) {
    console.error("❌ GET /subjects - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to fetch subjects.", details: err.message });
  }
};

// GET /subjects/:subjectName/topics
exports.getTopicsForSubject = async (req, res) => {
  const { subjectName } = req.params;
  console.log(`🚀 GET /subjects/${subjectName}/topics - Fetching topics...`);
  try {
    const subject = await Subject.findOne(
      { subject_name: subjectName },
      { topics: 1, _id: 0 }
    );
    if (!subject || !subject.topics) {
      console.warn(
        `⚠️ GET /subjects/.../topics - Subject not found: ${subjectName}`
      );
      return res
        .status(404)
        .json({ error: "Subject not found or it contains no topics." });
    }
    console.log(
      `✅ GET /subjects/.../topics - Successfully fetched ${subject.topics.length} topics.`
    );
    res.status(200).json(subject.topics);
  } catch (err) {
    console.error("❌ GET /subjects/.../topics - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to fetch topics.", details: err.message });
  }
};

// GET /unit
exports.getUnitData = async (req, res) => {
  const { subjectName, topicName, unitName } = req.query;
  if (!subjectName || !topicName || !unitName) {
    return res
      .status(400)
      .json({
        error:
          "subjectName, topicName, and unitName are required query parameters.",
      });
  }
  console.log(
    `🚀 GET /unit - Fetching data for: ${subjectName}/${topicName}/${unitName}`
  );
  try {
    const subject = await Subject.findOne(
      { subject_name: subjectName, "topics.topic_name": topicName },
      { "topics.$": 1 }
    );
    if (!subject || !subject.topics || subject.topics.length === 0) {
      return res
        .status(404)
        .json({ error: "Topic not found within the specified subject." });
    }
    const unit = subject.topics[0].units.find((u) => u.unit_name === unitName);
    if (!unit) {
      return res
        .status(404)
        .json({ error: "Unit not found within the specified topic." });
    }
    console.log(`✅ GET /unit - Successfully fetched unit data.`);
    res.status(200).json(unit);
  } catch (err) {
    console.error("❌ GET /unit - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to fetch unit data.", details: err.message });
  }
};

// POST /subjects
exports.createSubject = async (req, res) => {
  const { subject_name } = req.body;
  if (!subject_name) {
    return res.status(400).json({ error: "subject_name is required." });
  }
  console.log(`🚀 POST /subjects - Creating new subject: ${subject_name}`);
  try {
    const existingSubject = await Subject.findOne({ subject_name });
    if (existingSubject) {
      return res
        .status(409)
        .json({ error: "A subject with this name already exists." });
    }
    const newSubject = new Subject({ subject_name, topics: [] });
    await newSubject.save();
    console.log(`✅ POST /subjects - Successfully created subject.`);
    res.status(201).json(newSubject);
  } catch (err) {
    console.error("❌ POST /subjects - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to create subject.", details: err.message });
  }
};

// POST /topics
exports.createTopic = async (req, res) => {
  const { subjectName, topic_name } = req.body;
  if (!subjectName || !topic_name) {
    return res
      .status(400)
      .json({ error: "subjectName and topic_name are required." });
  }
  console.log(
    `🚀 POST /topics - Creating new topic: ${topic_name} in ${subjectName}`
  );
  try {
    const subject = await Subject.findOne({ subject_name: subjectName });
    if (!subject) {
      return res.status(404).json({ error: "Subject not found." });
    }
    if (subject.topics.some((t) => t.topic_name === topic_name)) {
      return res
        .status(409)
        .json({
          error: "A topic with this name already exists in this subject.",
        });
    }
    subject.topics.push({ topic_name, units: [] });
    await subject.save();
    console.log(`✅ POST /topics - Successfully created topic.`);
    res.status(201).json(subject);
  } catch (err) {
    console.error("❌ POST /topics - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to create topic.", details: err.message });
  }
};

// POST /units
exports.createUnit = async (req, res) => {
  const { subjectName, topicName, unit_name } = req.body;
  if (!subjectName || !topicName || !unit_name) {
    return res
      .status(400)
      .json({ error: "subjectName, topicName, and unit_name are required." });
  }
  console.log(
    `🚀 POST /units - Creating new unit: ${unit_name} in ${topicName}`
  );
  try {
    const subject = await Subject.findOne({ subject_name: subjectName });
    if (!subject) return res.status(404).json({ error: "Subject not found." });

    const topic = subject.topics.find((t) => t.topic_name === topicName);
    if (!topic) return res.status(404).json({ error: "Topic not found." });

    if (topic.units.some((u) => u.unit_name === unit_name)) {
      return res
        .status(409)
        .json({ error: "A unit with this name already exists in this topic." });
    }
    topic.units.push({
      unit_name,
      readingMaterial: "",
      mcqs: [],
      learningOutcomes: [],
    });
    await subject.save();
    console.log(`✅ POST /units - Successfully created unit.`);
    res.status(201).json(subject);
  } catch (err) {
    console.error("❌ POST /units - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to create unit.", details: err.message });
  }
};

// DELETE /subjects/:subjectName
exports.deleteSubjectByName = async (req, res) => {
  try {
    const subjectName = decodeURIComponent(req.params.subjectName);
    const result = await Subject.deleteOne({ subject_name: subjectName });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Subject not found" });
    }
    res.status(200).json({ message: "Subject deleted successfully" });
  } catch (error) {
    console.error("Error deleting subject:", error);
    res.status(500).json({ error: "Failed to delete subject" });
  }
};

// DELETE /topics/:topicId
exports.deleteTopicById = async (req, res) => {
  try {
    const { topicId } = req.params;
    const subject = await Subject.findOne({ "topics._id": topicId });
    if (!subject) {
      return res.status(404).json({ error: "Topic not found" });
    }
    subject.topics.pull({ _id: topicId });
    await subject.save();
    res.status(200).json({ message: "Topic deleted successfully" });
  } catch (error) {
    console.error("Error deleting topic:", error);
    res.status(500).json({ error: "Failed to delete topic" });
  }
};

// DELETE /subject/:subjectId
exports.deleteSubjectById = async (req, res) => {
  const { subjectId } = req.params;
  console.log(
    `🚀 DELETE /subject/${subjectId} - Request to delete entire subject.`
  );
  try {
    await Subject.findByIdAndDelete(subjectId);
    console.log(
      `✅ DELETE /subject/${subjectId} - Successfully deleted subject.`
    );
    res.status(200).json({ message: `Successfully deleted subject.` });
  } catch (err) {
    console.error(`❌ DELETE /subject/${subjectId} - Error:`, err.message);
    res
      .status(500)
      .json({
        error: "An internal server error occurred.",
        details: err.message,
      });
  }
};

// DELETE /topic
exports.deleteTopicByNames = async (req, res) => {
  const { subjectName, topicName } = req.body;
  console.log(`🚀 DELETE /topic - Request to delete topic: ${topicName}`);
  try {
    await Subject.updateOne(
      { subject_name: subjectName },
      { $pull: { topics: { topic_name: topicName } } }
    );
    console.log(`✅ Successfully deleted topic.`);
    res.status(200).json({ message: "Successfully deleted topic." });
  } catch (err) {
    console.error("❌ DELETE /topic - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to delete topic.", details: err.message });
  }
};

// DELETE /unit
exports.deleteUnitByNames = async (req, res) => {
  const { subjectName, topicName, unitName } = req.body;
  console.log(`🚀 DELETE /unit - Request to delete unit: ${unitName}`);
  try {
    await Subject.updateOne(
      { subject_name: subjectName, "topics.topic_name": topicName },
      { $pull: { "topics.$.units": { unit_name: unitName } } }
    );
    console.log(`✅ Successfully deleted unit.`);
    res.status(200).json({ message: "Successfully deleted unit." });
  } catch (err) {
    console.error("❌ DELETE /unit - Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to delete unit.", details: err.message });
  }
};
