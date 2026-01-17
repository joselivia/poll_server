import express from "express";
import { pool } from "../config-db";
import rateLimit from "express-rate-limit";

const router = express.Router();
const voteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 1,
  message: "Too many requests from this IP, slow down.",
});
router.get("/status", async (req, res) => {
  try {
    const { pollId, voter_id } = req.query;

    // Validate inputs
    if (!pollId || !voter_id) {
      return res.status(400).json({
        success: false,
        message: "pollId and voter_id are required",
      });
    }

    // 1. Get poll settings
    const pollSettings = await pool.query(
      "SELECT allow_multiple_votes FROM polls WHERE id = $1",
      [pollId]
    );

    if (pollSettings.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Poll not found",
      });
    }

    const allowMultiple = pollSettings.rows[0].allow_multiple_votes;

    // 2. Check if user has voted (regardless of multiple votes setting)
    const check = await pool.query(
      "SELECT * FROM votes WHERE poll_id = $1 AND voter_id = $2",
      [pollId, voter_id]
    );

    const alreadyVoted = (check.rowCount ?? 0) > 0;

    return res.json({
      success: true,
      alreadyVoted,
      allowMultipleVotes: allowMultiple,
    });
  } catch (error) {
    console.error("Error checking vote status:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.patch("/:id/allow-multiple", async (req, res) => {
  const pollId = parseInt(req.params.id);
  const { allow_multiple_votes } = req.body;

  if (isNaN(pollId) || typeof allow_multiple_votes !== "boolean") {
    return res.status(400).json({ message: "Invalid poll ID or vote setting." });
  }

  try {
    await pool.query(
      `UPDATE polls SET allow_multiple_votes = $1 WHERE id = $2`,
      [allow_multiple_votes, pollId]
    );
    return res.status(200).json({ message: `Multiple voting ${allow_multiple_votes ? "enabled" : "disabled"}.` });
  } catch (err) {
    console.error("Failed to update voting mode:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id/questions", async (req, res) => {
  const pollId = parseInt(req.params.id);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  try {
    const result = await pool.query(
      `SELECT id, poll_id, type, is_competitor_question, question_text
      FROM poll_questions
      WHERE poll_id = $1
      `,
      [pollId]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching poll questions:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
});
router.post("/", voteLimiter, async (req, res) => {
  const {
    id: pollId,
    competitorId,
    voter_id,
    name,
    gender,
    region,
    county,
    constituency,
    ward,
  } = req.body;

  if (!pollId || !competitorId || !voter_id) {
    return res.status(400).json({
      message: "Missing pollId, competitorId, or voter_id.",
    });
  }

  try {
    await pool.query("BEGIN");

    // 1️⃣ Get poll settings
    const pollSettings = await pool.query(
      `SELECT allow_multiple_votes FROM polls WHERE id = $1`,
      [pollId]
    );
    const allowMultiple = pollSettings.rows[0]?.allow_multiple_votes;

    // 2️⃣ If single-vote poll → ensure user has NOT voted
    if (!allowMultiple) {
      const already = await pool.query(
        `SELECT 1 FROM votes WHERE poll_id = $1 AND voter_id = $2`,
        [pollId, voter_id]
      );

      if ((already.rowCount ?? 0) > 0) {
        await pool.query("ROLLBACK");
        return res
          .status(403)
          .json({ message: "You have already voted in this poll." });
      }
    }

    // 3️⃣ Ensure competitor belongs to poll
    const competitorCheck = await pool.query(
      `SELECT id FROM poll_competitors WHERE id = $1 AND poll_id = $2`,
      [competitorId, pollId]
    );

    if (competitorCheck.rowCount === 0) {
      await pool.query("ROLLBACK");
      return res
        .status(400)
        .json({ message: "Competitor does not belong to the poll." });
    }

    // 4️⃣ INSERT VOTE safely
    try {
      const insert = await pool.query(
        `INSERT INTO votes (
          poll_id, competitor_id, voter_id, name, gender, region, county, constituency, ward
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id`,
        [pollId, competitorId, voter_id, name, gender, region, county, constituency, ward]
      );
    } catch (err: any) {
      if (err.code === "23505") {
        // duplicate vote detected
        await pool.query("ROLLBACK");
        //console.warn("Duplicate vote detected:", err.detail);
        return res
          .status(403)
          .json({ message: "You have already voted in this poll." });
      }
      throw err; // re-throw other errors
    }

    // 5️⃣ Update total votes
    await pool.query(
      `UPDATE polls 
       SET total_votes = (SELECT COUNT(*) FROM votes WHERE poll_id = $1)
       WHERE id = $1`,
      [pollId]
    );

    // 6️⃣ Log history
    const voteCountResult = await pool.query(
      `SELECT COUNT(*) AS total_votes 
       FROM votes 
       WHERE poll_id = $1 AND competitor_id = $2`,
      [pollId, competitorId]
    );

    await pool.query(
      `INSERT INTO vote_history (poll_id, competitor_id, vote_count)
       VALUES ($1, $2, $3)`,
      [pollId, competitorId, parseInt(voteCountResult.rows[0].total_votes)]
    );

    await pool.query("COMMIT");
    return res.status(200).json({ message: "Vote recorded successfully!" });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Vote Error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error while recording vote." });
  }
});



router.get("/:pollId/strongholds", async (req, res) => {
  const { pollId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
         v.county,
         v.constituency,
         v.ward,
         c.name AS candidate_name,
         COUNT(*) AS total_votes
       FROM votes v
       JOIN poll_competitors c ON v.competitor_id = c.id
       WHERE v.poll_id = $1
       GROUP BY v.county, v.constituency, v.ward, c.name
       ORDER BY v.county, v.constituency, v.ward;`,
      [pollId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Stronghold summary error:", error);
    return res.status(500).json({ message: "Error fetching combined stronghold data." });
  }
});

router.get("/:pollId/strongholds/:competitorId", async (req, res) => {
  const { pollId, competitorId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
        county,
        constituency,
        ward,
        COUNT(*) AS total_votes
      FROM votes
      WHERE poll_id = $1 AND competitor_id = $2
      GROUP BY county, constituency, ward
      ORDER BY county, constituency, ward;`,
      [pollId, competitorId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Stronghold summary error:", error);
    return res.status(500).json({ message: "Error fetching stronghold data." });
  }
});
export default router;
