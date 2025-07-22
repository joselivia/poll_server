import express from "express";
import pool from "../config-db";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.post("/", upload.any(), async (req, res) => {
  const {
    title,
    presidential,
    category,
    region,
    county,
    constituency,
    ward,
    party,
  } = req.body;

  let competitors: { name: string; party: string }[] = [];
  try {
    competitors = JSON.parse(req.body.competitors);
  } catch (err) {
     res.status(400).json({ error: "Invalid competitors format" });
  }

  try {
    
    const result = await pool.query(
      `INSERT INTO polls (title,presidential, profile, category, region, county, constituency,ward, party)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9)
       RETURNING id`,
      [title,presidential, null, category, region, county, constituency,ward, party]
    );

    const pollId = result.rows[0].id;

    for (let i = 0; i < competitors.length; i++) {
      const comp = competitors[i];
const file = (req.files as Express.Multer.File[])?.find(
  (f) => f.fieldname === `profile${i}`
);

      const buffer = file ? file.buffer : null;

      await pool.query(
        "INSERT INTO competitors (name, profile, party, poll_id) VALUES ($1, $2, $3, $4)",
        [comp.name, buffer, comp.party, pollId]
      );
    }

    res.status(201).json({ id: pollId, message: "✅ Poll created successfully" });
  } catch (error) {
    console.error("❌ Error creating poll:", error);
    res.status(500).json({ error: "Failed to create poll" });
  }
});


router.post("/votes", async (req, res) => {
  const { pollId, competitorId } = req.body;
  try {
    const parsedPollId = parseInt(pollId as string);
    const parsedCompetitorId = parseInt(competitorId as string);

    if (isNaN(parsedPollId) || isNaN(parsedCompetitorId)) {
      res.status(400).json({ error: "Invalid pollId or competitorId" });
      return;
    }

    const competitorCheck = await pool.query(
      "SELECT id FROM competitors WHERE id = $1 AND poll_id = $2",
      [parsedCompetitorId, parsedPollId]
    );
    if (competitorCheck.rowCount === 0) {
      res.status(400).json({ error: "Invalid competitor for this poll" });
      return;
    }

    await pool.query("INSERT INTO votes (competitor_id) VALUES ($1)", [
      parsedCompetitorId,
    ]);
    res.status(200).json({ message: "Vote recorded" });
  } catch (error) {
    console.error("❌ Error recording vote:", error);
    res.status(500).json({ error: "Failed to record vote" });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const parsedId = parseInt(id);

  if (isNaN(parsedId)) {
    res.status(400).json({ error: "Invalid poll ID" });
  }

  try {
    const pollQuery = await pool.query(
      `SELECT id, title,presidential,profile, category, region, county, constituency,ward, party, spoiled_votes
       FROM polls
       WHERE id = $1`,
      [parsedId]
    );

    const poll = pollQuery.rows[0];
    if (!poll) res.status(404).json({ error: "Poll not found" });

    const pollResult = await pool.query(
      `SELECT c.id, c.name,c.party,c.profile, COUNT(v.id) as vote_count
       FROM competitors c
       LEFT JOIN votes v ON c.id = v.competitor_id
       WHERE c.poll_id = $1
       GROUP BY c.id,c.name ,c.party,c.profile
       ORDER BY vote_count DESC`,
      [parsedId]
    );

    const totalVotes = await pool.query(
      `SELECT COUNT(*) as total FROM votes WHERE competitor_id IN (
        SELECT id FROM competitors WHERE poll_id = $1
      )`,
      [parsedId]
    );

const results = pollResult.rows.map((row: any) => {
const buffer = row.profile instanceof Buffer
  ? row.profile
  : Buffer.from(row.profile, 'binary');

const base64Image = buffer
  ? `data:image/png;base64,${buffer.toString("base64")}`
  : null;

  return {
    id: row.id,
    name: row.name,
    party: row.party,
    profile: base64Image,
    voteCount: parseInt(row.vote_count),
    percentage:
      totalVotes.rows[0].total > 0
        ? ((parseInt(row.vote_count) / totalVotes.rows[0].total) * 100).toFixed(2)
        : "0.00",
  };
});


    const lastUpdated =
      (
        await pool.query(
          "SELECT MAX(voted_at) as last_updated FROM votes WHERE competitor_id IN (SELECT id FROM competitors WHERE poll_id = $1)",
          [parsedId]
        )
      ).rows[0].last_updated || new Date();
  const rawCompetitors = pollResult.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    party: row.party,
    profile: row.profile?`data:image/png;base64,${row.profile.toString("base64")}` : null,}));
res.json({
  id: parsedId,
  title: pollQuery.rows[0]?.title,
  presidential: pollQuery.rows[0]?.presidential,
  profile: pollQuery.rows[0]?.profile || [],
  region: pollQuery.rows[0]?.region,
  category: pollQuery.rows[0]?.category, 
  county: pollQuery.rows[0]?.county,
  constituency: pollQuery.rows[0]?.constituency,
  ward: pollQuery.rows[0]?.ward,
  party: pollQuery.rows[0]?.party,
  spoiled_votes: pollQuery.rows[0]?.spoiled_votes || 0,
  totalVotes: parseInt(totalVotes.rows[0].total) || 0,
  results,
  competitors: rawCompetitors,
  lastUpdated,
});

  } catch (error) {
    console.error("❌ Error fetching results:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

router.get("/", async (req, res) => {
  const { category } = req.query;

  try {
    let result;
    if (category) {
      result = await pool.query(
        `SELECT 
          p.id,
          p.title,
          p.presidential,
          p.category,
          p.region,
          p.county,
          p.constituency,
          p.ward,
          p.party,
          MAX(v.voted_at) as last_updated
        FROM polls p
        LEFT JOIN competitors c ON p.id = c.poll_id
        LEFT JOIN votes v ON c.id = v.competitor_id
        WHERE p.category = $1
        GROUP BY 
          p.id, p.title, p.presidential, p.category,
          p.region, p.county, p.constituency, p.ward, p.party
        ORDER BY last_updated DESC NULLS LAST`,
        [category]
      );
    } else {
      result = await pool.query(
        `SELECT 
          p.id,
          p.title,
          p.presidential,
          p.category,
          p.region,
          p.county,
          p.constituency,
          p.ward,
          p.party,
          MAX(v.voted_at) as last_updated
        FROM polls p
        LEFT JOIN competitors c ON p.id = c.poll_id
        LEFT JOIN votes v ON c.id = v.competitor_id
        GROUP BY 
          p.id, p.title, p.presidential, p.category,
          p.region, p.county, p.constituency, p.ward, p.party
        ORDER BY last_updated DESC NULLS LAST`
      );
    }

    res.json(
      result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        presidential: row.presidential,
        category: row.category,
        region: row.region,
        county: row.county,
        constituency: row.constituency,
        ward: row.ward,
        party: row.party,
        lastUpdated: row.last_updated,
      }))
    );
  } catch (error) {
    console.error("❌ Error fetching polls:", error);
    res.status(500).json({ error: "Failed to fetch polls" });
  }
});


export default router;
