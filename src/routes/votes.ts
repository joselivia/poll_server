import express from "express";
import { pool } from "../config-db";
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
  }  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if voter already voted
    const existingVote = await client.query(
      `SELECT 1 FROM votes WHERE poll_id = $1 AND voter_id = $2`,
      [pollId, voter_id]
    );

    if (existingVote.rowCount?? 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "You have already voted in this poll." });
    }

    // Check competitor belongs to poll
    const checkCompetitor = await client.query(
      `SELECT id FROM poll_competitors WHERE id = $1 AND poll_id = $2`,
      [competitorId, pollId]
    );

    if (checkCompetitor.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Competitor does not belong to this poll." });
    }

    // Insert vote
    await client.query(
      `INSERT INTO votes (
        poll_id, competitor_id, voter_id, name, gender, region, county, constituency, ward
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [pollId, competitorId, voter_id, name, gender, region, county, constituency, ward]
    );

    // Increment total votes in polls table
    await client.query(`UPDATE polls SET total_votes = total_votes + 1 WHERE id = $1`, [pollId]);

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
  try {
    const { pollId, voter_id } = req.query;

    if (!pollId || !voter_id) {
      return res.status(400).json({ success: false, message: "pollId and voter_id required" });
    }

    const check = await pool.query(
      "SELECT 1 FROM votes WHERE poll_id = $1 AND voter_id = $2",
      [pollId, voter_id]
    );

    return res.json({ success: true, alreadyVoted: check.rowCount?? 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
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
