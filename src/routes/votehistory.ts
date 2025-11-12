import express from "express";
import { pool } from "../config-db";

const router = express.Router();

const intervalMap = {
  "1m": "1 minute",
  "15m": "15 minutes",
  "30m": "30 minutes",
  "1h": "1 hour",
  "1d": "1 day",
  "1w": "1 week",
  "1mon": "1 month",
};

// --- Historical data endpoint ---
router.get("/history/:pollId", async (req, res) => {
  const pollId = req.params.pollId;
  const intervalParam = req.query.interval || "15m";
  const sqlInterval = intervalMap[intervalParam as keyof typeof intervalMap] || "15 minutes";

  try {
const query = `
  WITH time_series AS (
    SELECT generate_series(
      NOW() - INTERVAL '${sqlInterval}',
      NOW(),
      INTERVAL '1 minute'
    ) AS recorded_time
  ),
  votes AS (
    SELECT 
      c.id AS competitor_id,
      vh.recorded_at,
      COUNT(*) OVER (PARTITION BY c.id ORDER BY vh.recorded_at) AS cumulative_votes
    FROM poll_competitors c
    LEFT JOIN vote_history vh
      ON vh.competitor_id = c.id
     AND vh.poll_id = $1
  )
  SELECT 
    t.recorded_time,
    v.competitor_id,
    COALESCE((
      SELECT v2.cumulative_votes
      FROM votes v2
      WHERE v2.competitor_id = v.competitor_id
        AND v2.recorded_at <= t.recorded_time
      ORDER BY v2.recorded_at DESC
      LIMIT 1
    ), 0) AS cumulative_votes
  FROM time_series t
  CROSS JOIN (SELECT DISTINCT competitor_id FROM votes) v
  ORDER BY t.recorded_time ASC;
`;  
    const { rows } = await pool.query(
  query,
  [pollId]
);
    res.json(rows);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ error: "Error fetching vote history" });
  }
});

//--- Live stream (SSE) endpoint --- SEND ONLY LATEST ---
router.get("/live-stream/:pollId", async (req, res) => {
  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  const pollId = req.params.pollId;

  const sendLatest = async () => {
    try {
      const query = `
        SELECT 
          c.id AS competitor_id,
          c.name,
          COUNT(vh.id) AS cumulative_votes
        FROM poll_competitors c
        LEFT JOIN vote_history vh ON vh.competitor_id = c.id AND vh.poll_id = $1
        WHERE c.poll_id = $1
        GROUP BY c.id, c.name
      `;

      const { rows } = await pool.query(query, [pollId]);
      const timestamp = new Date().toISOString();

      // Send only: [{ competitor_id, name, cumulative_votes, timestamp }]
      res.write(`data: ${JSON.stringify({ timestamp, updates: rows })}\n\n`);
    } catch (err) {
      console.error(err);
    }
  };

  // Send immediately, then every 2–5 seconds
  sendLatest();
  const interval = setInterval(sendLatest, 3000);

  req.on("close", () => clearInterval(interval));
});
export default router;
