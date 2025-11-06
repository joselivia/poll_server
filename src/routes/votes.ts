import express from "express";
import { pool } from "../config-db";
import { Result } from "pg";
import { parse } from "path";

const router = express.Router();

router.post("/", async (req, res) => {
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
    return res.status(400).json({ message: "Missing pollId, competitorId, or voter_id." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1️⃣ Check poll settings
    const pollSettings = await client.query(
      `SELECT allow_multiple_votes FROM polls WHERE id = $1`,
      [pollId]
    );

  const allowMultiple = pollSettings.rows[0]?.allow_multiple_votes;
  if (!allowMultiple) {
    const alreadyVoted = await client.query(
      `SELECT 1 FROM votes WHERE poll_id = $1 AND voter_id = $2`,
      [pollId, voter_id]
    );

    if (alreadyVoted?.rowCount && alreadyVoted.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "You have already voted in this poll." });
    }
  }

    const check = await client.query(
    `SELECT id FROM poll_competitors WHERE id = $1 AND poll_id = $2`,
    [competitorId, pollId]
  );

  if (check.rowCount === 0) {
    await client.query("ROLLBACK");
    return res.status(400).json({ message: "Competitor does not belong to the poll." });
  }
    await client.query(
      `INSERT INTO votes (
        poll_id, competitor_id, voter_id, name, gender, region, county, constituency, ward
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [pollId, competitorId, voter_id, name, gender, region, county, constituency, ward]
    );

    // 4️⃣ Increment total votes
    await client.query(`UPDATE polls SET total_votes = total_votes + 1 WHERE id = $1`, [pollId]);

const results= await client.query(
  `SELECT COUNT(*) AS total_votes FROM votes WHERE poll_id = $1 AND competitor_id = $2`,
  [pollId, competitorId]
);

const newVoteCount =parseInt(results.rows[0].total_votes, 10);
await pool.query(
  `INSERT INTO vote_history (poll_id, competitor_id, vote_count)
   VALUES ($1, $2, $3)`,
  [pollId, competitorId, newVoteCount]
);

    await client.query("COMMIT");
    return res.status(200).json({ message: "Vote recorded successfully!" });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Vote Error:", error);
    return res.status(500).json({ message: "Internal server error while recording vote." });
  } finally {
    client.release();
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
router.get("/status", async (req, res) => {
  const { pollId, voter_id } = req.query;

  if (!pollId || !voter_id) {
    return res.status(400).json({ message: "Missing pollId or voter_id" });
  }

  try {
    const result = await pool.query(
      `SELECT 1 FROM votes WHERE poll_id = $1 AND voter_id = $2`,
      [pollId, voter_id]
    );

const alreadyVoted = result.rowCount !== null && result.rowCount > 0;
    return res.json({ alreadyVoted });
  } catch (err) {
    console.error("Vote status check error:", err);
    return res.status(500).json({ message: "Server error checking vote status." });
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

export default router;
