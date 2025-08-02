import express from "express";
import { pool } from "../config-db";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id, 
        p.title,
        p.region, 
        p.county, 
        p.constituency, 
        p.ward, 
        p.created_at,
      p.voting_expires_at,
        TRUE AS is_competitor_only
      FROM polls p
      WHERE EXISTS (
        SELECT 1 
        FROM poll_competitors pc 
        WHERE pc.poll_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 
        FROM poll_questions pq 
        WHERE pq.poll_id = p.id AND pq.is_competitor_question = false
      )
      ORDER BY p.created_at DESC
    `);

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching aspirant-only polls:", err);
    return res.status(500).json({ message: "Server error." });
  }
});


router.get("/:id", async (req, res) => {
  const pollId = parseInt(req.params.id);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  try {
    const pollQuery = `
      SELECT id, title,presidential, category, region, county, constituency, ward, total_votes, spoiled_votes,voting_expires_at, created_at 
      FROM polls
      WHERE id = $1
    `;
    const pollResult = await pool.query(pollQuery, [pollId]);
    if (pollResult.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found." });
    }

    const poll = pollResult.rows[0];

    const competitorsQuery = `
      SELECT id, name, party, encode(profile_image, 'base64') AS profile
      FROM poll_competitors
      WHERE poll_id = $1
    `;
    const competitorsResult = await pool.query(competitorsQuery, [pollId]);

    const competitorsMap = new Map<number, any>();
    const competitors = competitorsResult.rows.map((row: any) => {
      const profile = row.profile
        ? `data:image/png;base64,${row.profile}`
        : null;

      const competitor = {
        id: row.id,
        name: row.name,
        party: row.party,
        profile,
      };
      competitorsMap.set(row.id, competitor);
      return competitor;
    });

    const voteResults = await pool.query(
      `SELECT c.id, c.name, COUNT(v.id) AS vote_count
       FROM poll_competitors c
       LEFT JOIN votes v ON v.competitor_id = c.id
       WHERE c.poll_id = $1
       GROUP BY c.id, c.name
       ORDER BY vote_count DESC`,
      [pollId]
    );

    if (voteResults.rows.length === 0) {
      return res.status(200).json({
        ...poll,
        results: [],
        totalVotes: 0,
        message: "No votes recorded for this poll."
      });
    }

    const totalValidVotes = voteResults.rows.reduce(
      (sum, row) => sum + parseInt(row.vote_count),
      0
    );

    const votesresults = voteResults.rows.map((row) => {
      const candidate = competitorsMap.get(row.id);
      const voteCount = parseInt(row.vote_count);
      const percentage =
        totalValidVotes > 0
          ? ((voteCount / totalValidVotes) * 100).toFixed(2)
          : "0.00";

      return {
        id: row.id,
        name: row.name,
        party: candidate?.party || "Independent",
        profile: candidate?.profile || null,
        voteCount,
        percentage,
      };
    });

    const response = {
      id: poll.id,
      title: poll.title,
      presidential:poll.presidential,
      category: poll.category,
      region: poll.region,
      county: poll.county,
      constituency: poll.constituency,
      ward: poll.ward,
      totalVotes: poll.total_votes || 0,
      spoiled_votes: poll.spoiled_votes || 0,
      voting_expires_at: poll.voting_expires_at,
      created_at: poll.created_at,
      results: votesresults
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("Error fetching aspirant poll:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
