// src/controllers/executionController.js
const { executeCode } = require("../services/judge0Service");

exports.handleCodeExecution = async (req, res) => {
  const { source_code, language_id } = req.body;
  console.log(
    `🚀 POST /api/execute-code - Executing code for language ID: ${language_id}`
  );

  if (!source_code || !language_id) {
    return res
      .status(400)
      .json({ error: "Source code and language ID are required." });
  }

  try {
    const resultData = await executeCode(source_code, language_id);
    console.log(
      `✅ POST /api/execute-code - Execution complete. Status: ${resultData.status.description}`
    );
    res.status(200).json(resultData);
  } catch (error) {
    const errorData = error.response
      ? error.response.data
      : { message: error.message };
    console.error("❌ POST /api/execute-code - Error:", errorData);
    res
      .status(500)
      .json({
        error: "An error occurred while executing the code.",
        details: errorData,
      });
  }
};
