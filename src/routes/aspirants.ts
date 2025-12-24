import express from "express";
import { pool } from "../config-db";
import multer from "multer";
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
router.get("/", async (req, res) => {
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
        p.created_at,
        p.voting_expires_at,
        p.published,
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
router.get("/published", async (req, res) => {
  
  try {
    const result = await pool.query(
      `SELECT 
  p.id, 
  p.title, 
  p.presidential, 
  p.category, 
  p.region, 
  p.county, 
  p.constituency, 
  p.ward, 
  (
    COALESCE((SELECT COUNT(*) FROM votes WHERE poll_id = p.id), 0) +
    COALESCE((SELECT SUM(vote_count) FROM votes_admin WHERE poll_id = p.id), 0)
  ) as total_votes,
  p.spoiled_votes, 
  p.published, 
  p.voting_expires_at, 
  p.created_at
FROM polls p
WHERE p.published = true
ORDER BY p.created_at DESC
    `
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch published polls" });
  }
});
// Lightweight endpoint for metadata (title and competitor question only)
router.get("/:id/metadata", async (req, res) => {
  const pollId = parseInt(req.params.id);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  try {
    const pollQuery = `
      SELECT title
      FROM polls
      WHERE id = $1
    `;
    const pollResult = await pool.query(pollQuery, [pollId]);
    if (pollResult.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found." });
    }

    const questionQuery = `
      SELECT question_text
      FROM poll_questions
      WHERE poll_id = $1 AND is_competitor_question = true
      LIMIT 1
    `;
    const questionResult = await pool.query(questionQuery, [pollId]);
    
    return res.status(200).json({
      title: pollResult.rows[0].title,
      competitorQuestion: questionResult.rows[0]?.question_text || "Select Your Candidate"
    });
  } catch (err) {
    console.error("Error fetching poll metadata:", err);
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
      SELECT id, title, presidential, category, region, county, constituency, ward, total_votes, spoiled_votes,published, voting_expires_at, created_at 
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

    // === Load Admin Bulk Votes ===
    const adminVotesResult = await pool.query(
      `SELECT competitor_id, SUM(vote_count) AS admin_vote_count
       FROM votes_admin
       WHERE poll_id = $1
       GROUP BY competitor_id`,
      [pollId]
    );

    // Create a map of admin votes by competitor ID
    const adminVotesMap = new Map<number, number>();
    adminVotesResult.rows.forEach((row: any) => {
      adminVotesMap.set(row.competitor_id, parseInt(row.admin_vote_count));
    });

    if (voteResults.rows.length === 0 && adminVotesMap.size === 0) {
      return res.status(200).json({
        ...poll,
        results: [],
        totalVotes: 0,
        message: "No votes recorded for this poll.",
      });
    }

    // Merge individual votes with admin bulk votes
    const mergedVotes = new Map<number, { name: string; voteCount: number }>();
    
    voteResults.rows.forEach((row) => {
      const individualCount = parseInt(row.vote_count);
      const adminCount = adminVotesMap.get(row.id) || 0;
      mergedVotes.set(row.id, {
        name: row.name,
        voteCount: individualCount + adminCount,
      });
    });

    // Add any competitors that only have admin votes
    adminVotesMap.forEach((adminCount, competitorId) => {
      if (!mergedVotes.has(competitorId)) {
        const competitor = competitorsMap.get(competitorId);
        if (competitor) {
          mergedVotes.set(competitorId, {
            name: competitor.name,
            voteCount: adminCount,
          });
        }
      }
    });

    const totalValidVotes = Array.from(mergedVotes.values()).reduce(
      (sum, data) => sum + data.voteCount,
      0
    );

    const votesresults = Array.from(mergedVotes.entries()).map(([id, data]) => {
      const candidate = competitorsMap.get(id);
      const percentage =
        totalValidVotes > 0
          ? ((data.voteCount / totalValidVotes) * 100).toFixed(2)
          : "0.00";

      return {
        id,
        name: data.name,
        party: candidate?.party || "No Party",
        profile: candidate?.profile || null,
        voteCount: data.voteCount,
        percentage,
      };
    }).sort((a, b) => b.voteCount - a.voteCount);

    // Calculate total votes including admin bulk votes
    const individualVoteCount = await pool.query(
      `SELECT COUNT(*) as count FROM votes WHERE poll_id = $1`,
      [pollId]
    );
    const adminBulkVoteCount = await pool.query(
      `SELECT COALESCE(SUM(vote_count), 0) as count FROM votes_admin WHERE poll_id = $1`,
      [pollId]
    );
    
    const totalVotesIncludingBulk = 
      parseInt(individualVoteCount.rows[0].count) + 
      parseInt(adminBulkVoteCount.rows[0].count);

    const response = {
      id: poll.id,
      title: poll.title,
      presidential: poll.presidential,
      category: poll.category,
      region: poll.region,
      county: poll.county,
      constituency: poll.constituency,
      ward: poll.ward ,
      totalVotes: totalVotesIncludingBulk,
      spoiled_votes: poll.spoiled_votes || 0,
      voting_expires_at: poll.voting_expires_at,
      created_at: poll.created_at,
      published: poll.published,
      competitors: competitors,
      results: votesresults,
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("Error fetching aspirant poll:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

// ✅ Update poll by ID including competitors
router.put("/:id", upload.any(), async (req, res) => {
  const pollId = req.params.id;
  const { title, presidential, category, region, county, constituency, ward, voting_expires_at } = req.body;
  try {
    await pool.query("BEGIN");
    const pollResult = await pool.query(
      `UPDATE polls
       SET title=$1, presidential=$2, category=$3, region=$4, county=$5,
           constituency=$6, ward=$7, voting_expires_at=$8
       WHERE id=$9 RETURNING *`,
      [title, presidential, category, region, county, constituency, ward,voting_expires_at, pollId]
    );
    if (pollResult.rows.length === 0) {
      await pool.query("ROLLBACK");
        return res.status(404).json({ message: "Poll not found." });
    }
 let competitors: any[] = [];

if (Array.isArray(req.body.competitors)) {

  interface CompetitorInput {
    id: string;
    name: string;
    party: string;
    profile: string;
  }

  interface CompetitorParsed {
    id: number | null;
    name: string;
    party: string;
    file: Express.Multer.File | null;
  }

  competitors = (req.body.competitors as CompetitorInput[]).map(
    (comp: CompetitorInput, idx: number): CompetitorParsed => {
      const file =
        (req.files as Express.Multer.File[])?.find(
          (f) => f.fieldname === `competitors[${idx}][profile]`
        ) || null;

      return {
        id: comp.id ? parseInt(comp.id) : null,
        name: comp.name?.trim() || "",
        party: comp.party || "",
        file,
      };
    }
  );
  const existing = await pool.query(
    "SELECT id FROM poll_competitors WHERE poll_id = $1",
    [pollId]
  );

  const existingIds = existing.rows.map((r) => r.id);

  const incomingIds = competitors
    .filter((c) => c.id !== null)
    .map((c) => c.id);

  const toDelete = existingIds.filter((id) => !incomingIds.includes(id));
  if (toDelete.length > 0) {
    await pool.query(
      `DELETE FROM poll_competitors 
       WHERE poll_id = $1 AND id = ANY($2::int[])`,
      [pollId, toDelete]
    );
    await pool.query(
  `UPDATE polls
   SET total_votes = (
     SELECT COUNT(*) FROM votes WHERE poll_id = $1
   )
   WHERE id = $1`,
  [pollId]
);
  }
} else {
  console.warn("⚠️ No competitors found in request body");
}

    for (const comp of competitors) {
      if (!comp.name) {
        await pool.query("ROLLBACK");
        return res.status(400).json({ message: "Competitor name is required." });
      }

      if (comp.id) {
        if (comp.file) {
          await pool.query(
            `UPDATE poll_competitors
             SET name=$1, party=$2, profile_image=$3
             WHERE id=$4 AND poll_id=$5`,
            [comp.name, comp.party || null, comp.file.buffer, comp.id, pollId]
          );
        } else {
          await pool.query(
            `UPDATE poll_competitors
             SET name=$1, party=$2
             WHERE id=$3 AND poll_id=$4`,
            [comp.name, comp.party || null, comp.id, pollId]
          );
        }
      } else {
        await pool.query(
          `INSERT INTO poll_competitors (poll_id, name, party, profile_image)
           VALUES ($1, $2, $3, $4)`,
          [pollId, comp.name, comp.party || null, comp.file ? comp.file.buffer : null]
        );
      }
    }
    // ✅ Update or insert competitor question
if (Array.isArray(req.body.questions)) {
  for (const q of req.body.questions) {
    if (q.id) {
      await pool.query(
        `UPDATE poll_questions
         SET question_text = $1, type = $2, is_competitor_question = $3
         WHERE id = $4 AND poll_id = $5`,
        [q.question_text, q.type, q.is_competitor_question || false, q.id, pollId]
      );
    }
  }
}
   const competitorsResult = await pool.query(
      `SELECT id, name, party,
              CASE
                WHEN profile_image IS NOT NULL
                  THEN 'data:image/png;base64,' || encode(profile_image, 'base64')
                ELSE NULL
              END as profile
       FROM poll_competitors
       WHERE poll_id=$1`,
      [pollId]
    );
const questionsResult = await pool.query(
  `SELECT id, type, is_competitor_question, question_text
   FROM poll_questions
   WHERE poll_id = $1`,
  [pollId]
);

    await pool.query("COMMIT");

    res.status(200).json({
      message: "Poll updated successfully",
      poll: { ...pollResult.rows[0], competitors: competitorsResult.rows, questions: questionsResult.rows },
    });
  } catch (err: any) {
    await pool.query("ROLLBACK");
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// DELETE a poll
router.delete("/:id", async (req, res) => {
  const pollId = parseInt(req.params.id);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  try {
    const pollCheck = await pool.query("SELECT id FROM polls WHERE id = $1", [
      pollId,
    ]);
    if (pollCheck.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found." });
    }

    await pool.query("DELETE FROM votes WHERE poll_id = $1", [pollId]);
    await pool.query("DELETE FROM poll_competitors WHERE poll_id = $1", [
      pollId,
    ]);
    await pool.query("DELETE FROM polls WHERE id = $1", [pollId]);

    return res.status(200).json({ message: "Poll deleted successfully." });
  } catch (err) {
    console.error("Error deleting poll:", err);
    return res.status(500).json({ message: "Server error." });
  }
});


router.put("/:id/publish", async (req, res) => {
  const { id } = req.params;
  const { published } = req.body; 

  try {
    const result = await pool.query(
      "UPDATE polls SET published = $1 WHERE id = $2 RETURNING *",
      [published, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Poll not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating publish status:", error);
    res.status(500).json({ message: "Failed to update publish status" });
  }
});

// === ADMIN BULK VOTES ===

// Submit or update admin bulk votes for competitors
router.post("/:pollId/admin-bulk-votes", async (req, res) => {
  const pollId = parseInt(req.params.pollId, 10);
  const { votes, constituency, ward } = req.body;

  if (isNaN(pollId) || !Array.isArray(votes)) {
    return res.status(400).json({ message: "Invalid poll ID or votes data." });
  }

  try {
    await pool.query("BEGIN");

    for (const vote of votes) {
      const { competitorId, voteCount, genderCounts } = vote;

      if (!competitorId || voteCount === undefined) {
        await pool.query("ROLLBACK");
        return res.status(400).json({ message: "Missing competitor ID or vote count." });
      }

      // Check if entry exists
      const existing = await pool.query(
        `SELECT id FROM votes_admin 
         WHERE poll_id = $1 AND competitor_id = $2 
         AND (constituency IS NOT DISTINCT FROM $3) 
         AND (ward IS NOT DISTINCT FROM $4)`,
        [pollId, competitorId, constituency || null, ward || null]
      );

      if (existing.rows.length > 0) {
        // Update existing entry
        await pool.query(
          `UPDATE votes_admin 
           SET vote_count = $1, 
               gender_counts = $2,
               updated_at = NOW()
           WHERE poll_id = $3 AND competitor_id = $4 
           AND (constituency IS NOT DISTINCT FROM $5) 
           AND (ward IS NOT DISTINCT FROM $6)`,
          [
            voteCount,
            genderCounts ? JSON.stringify(genderCounts) : '{}',
            pollId,
            competitorId,
            constituency || null,
            ward || null,
          ]
        );
      } else {
        // Insert new entry
        await pool.query(
          `INSERT INTO votes_admin 
           (poll_id, competitor_id, vote_count, gender_counts, constituency, ward)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            pollId,
            competitorId,
            voteCount,
            genderCounts ? JSON.stringify(genderCounts) : '{}',
            constituency || null,
            ward || null,
          ]
        );
      }
    }

    await pool.query("COMMIT");
    return res.status(201).json({ message: "Admin bulk votes submitted successfully!" });
  } catch (error: any) {
    await pool.query("ROLLBACK");
    console.error("Error submitting admin bulk votes:", error);
    return res.status(500).json({ message: error.message || "Failed to submit admin bulk votes." });
  }
});

// Get admin bulk votes for a poll
router.get("/:pollId/admin-bulk-votes", async (req, res) => {
  const pollId = parseInt(req.params.pollId, 10);
  let { constituency, ward } = req.query;

  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  // Handle array query params
  if (Array.isArray(constituency)) constituency = constituency[0];
  if (Array.isArray(ward)) ward = ward[0];

  try {
    let query = `
      SELECT 
        competitor_id,
        vote_count,
        gender_counts,
        constituency,
        ward,
        updated_at
      FROM votes_admin
      WHERE poll_id = $1`;
    
    const params: any[] = [pollId];
    let paramIndex = 2;

    if (constituency) {
      query += ` AND constituency = $${paramIndex++}`;
      params.push(constituency);
    }

    if (ward) {
      query += ` AND ward = $${paramIndex++}`;
      params.push(ward);
    }

    const result = await pool.query(query, params);

    return res.json(result.rows);
  } catch (error: any) {
    console.error("Error fetching admin bulk votes:", error);
    return res.status(500).json({ message: "Failed to fetch admin bulk votes." });
  }
});



export default router;
