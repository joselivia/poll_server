import express from "express";
import multer from "multer";
import { pool } from "../config-db"; 
import { requireAdmin, requireEnumerator, AuthRequest } from "../middleware/auth";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
interface PollOption {
  id?: number;
  optionText?: string;
  text?: string;
}
interface PollQuestion {
  id?: number;
  type: string;
  questionText: string;
  isCompetitorQuestion?: boolean;
  options?: PollOption[];
}

// Create a new poll - Admin only
router.post("/", requireAdmin, async (req: AuthRequest, res) => {
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
      const { type, questionText, options, isCompetitorQuestion,scale } = q;
      const questionInsert = await client.query(
        `INSERT INTO poll_questions (poll_id, type, question_text,is_competitor_question) VALUES ($1, $2, $3, $4) RETURNING id`,
        [pollId, type, questionText, isCompetitorQuestion === true]
      );

      const questionId = questionInsert.rows[0].id;
      if (type === "single-choice" || type === "multi-choice" || type === "yes-no-notsure" || type === "ranking") {
       
        for (const opt of options) {const optionText = typeof opt === "string" ? opt : opt.text;
          await client.query(
            `INSERT INTO poll_options (question_id, option_text) VALUES ($1, $2)`,
            [questionId, optionText]
          );
        }
      }
            if (type === "rating") {
        await client.query(
          `INSERT INTO poll_options (question_id, option_text) VALUES ($1, $2)`,
          [questionId, JSON.stringify({ scale: scale || 5 })]
        );
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
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID" });
  }

  try {
    await pool.query("BEGIN");

    const pollQuestions: PollQuestion[] = JSON.parse(req.body.PollQuestions || "[]");

    const pollExists = await pool.query(`SELECT id FROM polls WHERE id = $1`, [pollId]);
    if (!pollExists.rows.length) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ message: "Poll not found." });
    }

    const existingQuestionsRes = await pool.query(
      `SELECT id FROM poll_questions WHERE poll_id = $1`,
      [pollId]
    );
    const existingQuestionIds = existingQuestionsRes.rows.map((r) => r.id);

    // Parse incoming question IDs as numbers for proper comparison
    const incomingQuestionIds = pollQuestions
      .filter(q => q.id)
      .map(q => {
        const parsed = typeof q.id === 'string' ? parseInt(q.id, 10) : q.id;
        return isNaN(parsed!) ? null : parsed;
      })
      .filter(id => id !== null) as number[];
    
    const questionsToDelete = existingQuestionIds.filter(id => !incomingQuestionIds.includes(id));

    for (const qid of questionsToDelete) {
      await pool.query(`DELETE FROM poll_questions WHERE id = $1`, [qid]);
    }

    for (const q of pollQuestions) {
      // Parse question ID as number
      let questionIdNum: number | null = null;
      if (q.id) {
        const parsed = typeof q.id === 'string' ? parseInt(q.id, 10) : q.id;
        questionIdNum = isNaN(parsed) ? null : parsed;
      }
      
      const isExisting = questionIdNum !== null && existingQuestionIds.includes(questionIdNum);

      const isChoice =
        q.type === "single-choice" ||
        q.type === "multi-choice" ||
        q.type === "ranking" ||
        q.type === "yes-no-notsure";

      // FORCE DEFAULT OPTIONS FOR YES-NO-NOTSURE
      let optionsToUse: string[] = [];

      if (q.type === "yes-no-notsure") {
        optionsToUse = ["Yes", "No", "Not Sure"];
      } else if (isChoice) {
        optionsToUse = (q.options || []).map(opt =>
          typeof opt === "string" ? opt : opt.optionText || opt.text || ""
        );
      }

      if (isExisting) {
        // --- UPDATE QUESTION ---
        await pool.query(
          `UPDATE poll_questions
           SET type=$1, question_text=$2, is_competitor_question=$3
           WHERE id=$4`,
          [q.type, q.questionText, !!q.isCompetitorQuestion, questionIdNum]
        );

        if (isChoice) {
          // Fetch existing options
          const existingOptionsRes = await pool.query(
            `SELECT id FROM poll_options WHERE question_id = $1`,
            [questionIdNum]
          );
          const existingOptionIds = existingOptionsRes.rows.map((r) => r.id);

          // Parse incoming option IDs as numbers
          const incomingOptions = (q.options || []).map(opt => {
            if (typeof opt === "string") {
              return { id: null, text: opt };
            }
            const optionId = opt.id ? (typeof opt.id === 'string' ? parseInt(opt.id, 10) : opt.id) : null;
            return {
              id: optionId && !isNaN(optionId) ? optionId : null,
              text: opt.optionText || opt.text || ""
            };
          });

          const incomingOptionIds = incomingOptions
            .filter(opt => opt.id !== null)
            .map(opt => opt.id) as number[];

          // Delete options that are no longer in the incoming data
          const optionsToDelete = existingOptionIds.filter(id => !incomingOptionIds.includes(id));
          for (const optId of optionsToDelete) {
            await pool.query(`DELETE FROM poll_options WHERE id = $1`, [optId]);
          }

          // Update existing options or insert new ones
          for (const opt of incomingOptions) {
            if (opt.id && existingOptionIds.includes(opt.id)) {
              // Update existing option
              await pool.query(
                `UPDATE poll_options SET option_text=$1 WHERE id=$2`,
                [opt.text, opt.id]
              );
            } else {
              // Insert new option
              await pool.query(
                `INSERT INTO poll_options (question_id, option_text)
                 VALUES ($1, $2)`,
                [questionIdNum, opt.text]
              );
            }
          }
        }
      } else {
        // --- NEW QUESTION ---
        const insertQ = await pool.query(
          `INSERT INTO poll_questions (poll_id, type, question_text, is_competitor_question)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [pollId, q.type, q.questionText, !!q.isCompetitorQuestion]
        );

        const newQuestionId = insertQ.rows[0].id;

        if (isChoice) {
          for (const text of optionsToUse) {
            await pool.query(
              `INSERT INTO poll_options (question_id, option_text)
               VALUES ($1, $2)`,
              [newQuestionId, text]
            );
          }
        }
      }
    }

    await pool.query("COMMIT");
    return res.status(200).json({ message: "Quiz updated successfully." });

  } catch (err) {
    console.error("Update quiz error:", err);
    await pool.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to update quiz." });
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

// Get published opinion polls for public viewing
router.get("/published", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id, 
        p.title, 
        p.presidential, 
        p.category, 
        p.region, 
        p.county, 
        p.constituency, 
        p.ward, 
        p.published, 
        p.voting_expires_at, 
        p.created_at,
        TRUE AS is_opinion_poll
      FROM polls p
      WHERE p.published = true
      AND EXISTS (
        SELECT 1 FROM poll_questions q 
        WHERE q.poll_id = p.id AND q.is_competitor_question = false
      )
      ORDER BY p.created_at DESC
    `);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching published opinion polls:", error);
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

      if (q.type === "single-choice" || q.type === "multi-choice" || q.type === "yes-no-notsure" || q.type === "ranking" || q.type === "rating") {
        const opts = await client.query(
          `SELECT id, option_text FROM poll_options WHERE question_id = $1 ORDER BY id`, 
          [q.id]
        );
          options = opts.rows.map((opt: { id: number; option_text: string }) => {
          if (q.type === "rating") {
            try {
              const parsed = JSON.parse(opt.option_text);
              return { id: opt.id, optionText: parsed.scale?.toString() || "5" };
            } catch {
              return { id: opt.id, optionText: "5" };
            }
          } else {
            return { id: opt.id, optionText: opt.option_text };
          }
        });
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

// Toggle publish status for opinion polls
router.put("/:id/publish", async (req, res) => {
  const { id } = req.params;
  const { published } = req.body;

  try {
    const result = await pool.query(
      `UPDATE polls SET published = $1 WHERE id = $2 RETURNING *`,
      [published, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found" });
    }

    res.status(200).json({ message: "Poll published status updated", poll: result.rows[0] });
  } catch (error) {
    console.error("Error updating poll publish status:", error);
    res.status(500).json({ message: "Failed to update poll publish status" });
  }
});

export default router;