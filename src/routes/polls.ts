import express from "express";
import multer from "multer";
import { pool } from "../config-db"; 

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", async (req, res) => {
  const {
    title,
    category,
    presidential,
    region,
    county,
    constituency,
    ward,
    voting_expires_at
  } = req.body;

  if (!title || !category || !region) {
    return res.status(400).json({ message: "Missing required fields for poll creation." });
  }

  let expiry = null;
  if (voting_expires_at) {
    expiry = new Date(voting_expires_at);
    if (isNaN(expiry.getTime())) {
      return res.status(400).json({ message: "Invalid voting_expires_at format." });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO polls (title, category, presidential, region, county, constituency, ward, voting_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [title, category, presidential, region, county || "All", constituency || "All", ward || "All", expiry]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ message: "Server error during poll creation." });
  }
});
router.post("/createQuiz", upload.any(), async (req, res) => {
  const { pollId } = req.body;

  if (!pollId) {
    return res.status(400).json({ message: "Poll ID is missing. Cannot add quiz details without an existing poll." });
  }
  const client = await pool.connect();

  try {
    const mainCompetitors = JSON.parse(req.body.mainCompetitors);
    const dynamicPollQuestions = JSON.parse(req.body.dynamicPollQuestions);
    await client.query("BEGIN"); 

    const pollExists = await client.query(`SELECT id FROM polls WHERE id = $1`, [pollId]);
    if (pollExists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Poll not found for the provided ID." });
    }

    for (let i = 0; i < mainCompetitors.length; i++) {
      const { name, party } = mainCompetitors[i];
      const file = Array.isArray(req.files) ? req.files.find(f => f.fieldname === `mainProfile-${i}`) : undefined;
      const profileBuffer = file ? file.buffer : null;
      await client.query(
        `INSERT INTO poll_competitors (poll_id, name, party, profile_image) VALUES ($1, $2, $3, $4)`,
        [pollId, name, party || null, profileBuffer]
      );
    }

    for (const q of dynamicPollQuestions) {
      const { type, questionText, options, isCompetitorQuestion } = q;
      const questionInsert = await client.query(
        `INSERT INTO poll_questions (poll_id, type, question_text,is_competitor_question) VALUES ($1, $2, $3, $4) RETURNING id`,
        [pollId, type, questionText, isCompetitorQuestion === true]
      );

      const questionId = questionInsert.rows[0].id;
      if (type === "single-choice" || type === "multi-choice" || type === "yes-no-notsure") {
        for (const opt of options) {
          await client.query(
            `INSERT INTO poll_options (question_id, option_text) VALUES ($1, $2)`,
            [questionId, opt]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Quiz details saved successfully for poll.", pollId: pollId });
  } catch (error) {
    if (client) { 
      await client.query("ROLLBACK");
    }
    console.error("Transaction or unexpected error:", error);
    res.status(500).json({ message: "Failed to save quiz details." });
  } finally {
    if (client) {
      client.release();
    }
  }
});
router.put("/updateQuiz/:id", upload.any(), async (req, res) => {
  const pollId = parseInt(req.params.id);
  if (isNaN(pollId)) return res.status(400).json({ message: "Invalid poll ID" });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const pollQuestions = JSON.parse(req.body.PollQuestions || "[]");
    const pollExists = await client.query(`SELECT id FROM polls WHERE id = $1`, [pollId]);
    if (!pollExists.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Poll not found." });
    }

    console.log("Updating quiz for poll:", pollId);
    const existingQuestionsRes = await client.query(
      `SELECT id FROM poll_questions WHERE poll_id = $1`,
      [pollId]
    );
    const existingQuestionIds = existingQuestionsRes.rows.map(r => r.id);

    for (const q of pollQuestions) {
      const questionIdNum = q.id ? parseInt(q.id) : null;

      if (questionIdNum && existingQuestionIds.includes(questionIdNum)) {
        // Update existing question
        await client.query(
          `UPDATE poll_questions
           SET type=$1, question_text=$2, is_competitor_question=$3
           WHERE id=$4`,
          [q.type, q.questionText, !!q.isCompetitorQuestion, questionIdNum]
        );

        // Remove old options
        await client.query(`DELETE FROM poll_options WHERE question_id=$1`, [questionIdNum]);

if (
  q.type === "single-choice" ||
  q.type === "multi-choice" ||
  q.type === "yes-no-notsure" ||
  q.type === "rate"
) {
  let optsToInsert: string[] = [];
type Option = string | { optionText?: string; text?: string };

if (Array.isArray(q.options) && q.options.length > 0) {
  for (const opt of q.options as Option[]) {
    const text = typeof opt === "string" ? opt : opt.optionText || opt.text || "";
    await client.query(
      `INSERT INTO poll_options (question_id, option_text) VALUES ($1,$2)`,
      [questionIdNum, text]
    );
  }
}

}

      } else {
        // Insert new question
        const insertQ = await client.query(
          `INSERT INTO poll_questions (poll_id,type,question_text,is_competitor_question)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [pollId, q.type, q.questionText, !!q.isCompetitorQuestion]
        );

        const newQuestionId = insertQ.rows[0].id;

        if (
          (q.type === "single-choice" || q.type === "multi-choice" || q.type === "yes-no-notsure") &&
          Array.isArray(q.options)
        ) {
          for (const opt of q.options) {
            const text = typeof opt === "string" ? opt : opt.optionText || opt.text;
            await client.query(
              `INSERT INTO poll_options (question_id, option_text) VALUES ($1,$2)`,
              [newQuestionId, text]
            );
          }
        }
      }
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "Quiz updated successfully." });
  } catch (err) {
    console.error("Update quiz error:", err);
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to update quiz." });
  } finally {
    client.release();
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*
      FROM polls p
      WHERE EXISTS (
        SELECT 1 FROM poll_questions q 
        WHERE q.poll_id = p.id AND q.is_competitor_question = false
      )
      ORDER BY p.created_at DESC
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching polls:", error);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", async (req, res) => {
  const pollId = parseInt(req.params.id);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID" });
  }

  const client = await pool.connect();
  try {

    const pollResult = await client.query(
      `SELECT id, title, category, presidential, region, county, constituency, ward,voting_expires_at, created_at FROM polls WHERE id = $1`,
      [pollId]
    );
    if (pollResult.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found" });
    }

    const competitors = await client.query(
      `SELECT id, name, party, encode(profile_image, 'base64') AS profile_base64
       FROM poll_competitors WHERE poll_id = $1 ORDER BY id`, 
      [pollId]
    );

    const questionsRes = await client.query(
      `SELECT id, type, question_text,is_competitor_question FROM poll_questions WHERE poll_id = $1 ORDER BY id`, 
      [pollId]
    );

    const questions = [];
    for (const q of questionsRes.rows) {
      let options: { id: number; optionText: string }[] = [];

      if (q.type === "single-choice" || q.type === "multi-choice" || q.type === "yes-no-notsure") {
        const opts = await client.query(
          `SELECT id, option_text FROM poll_options WHERE question_id = $1 ORDER BY id`, 
          [q.id]
        );
        options = opts.rows.map((opt: { id: number; option_text: string }) => ({ id: opt.id, optionText: opt.option_text }));
      }

      questions.push({
        id: q.id,
        type: q.type,
        questionText: q.question_text,
        options,
        isCompetitorQuestion: q.is_competitor_question === true,
      });
    }

    return res.json({
      id: pollResult.rows[0].id,
      title: pollResult.rows[0].title,
      category: pollResult.rows[0].category,
      presidential: pollResult.rows[0].presidential,
      region: pollResult.rows[0].region,
      county: pollResult.rows[0].county,
      constituency: pollResult.rows[0].constituency,
      ward: pollResult.rows[0].ward,
      votingExpiresAt: pollResult.rows[0].voting_expires_at,
      createdAt: pollResult.rows[0].created_at,
      competitors: competitors.rows.map((row: { id: number; name: string; party: string; profile_base64: string | null; }) => ({
        id: row.id, 
        name: row.name,
        party: row.party,
        profileImage: row.profile_base64
          ? `data:image/png;base64,${row.profile_base64}`
          : null,
      })),
      questions,
    });
  } catch (error) {
    console.error("Error fetching poll:", error);
    return res.status(500).json({ message: "Server error" });
  } finally {
    if (client) {
      client.release();
    }
  }
});




export default router;