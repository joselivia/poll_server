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
    const { rows } = await pool.query(
      `
      WITH time_series AS (
        SELECT generate_series(
          NOW() - INTERVAL '${sqlInterval}',
          NOW(),
          INTERVAL '1 minute'
        ) AS recorded_time
      )
      SELECT 
        t.recorded_time,
        c.id AS competitor_id,
        COALESCE((
          SELECT COUNT(*) 
          FROM vote_history vh
          WHERE vh.competitor_id = c.id
            AND vh.poll_id = $1
            AND vh.recorded_at <= t.recorded_time
        ), 0) AS cumulative_votes
      FROM time_series t
      CROSS JOIN poll_competitors c
      ORDER BY t.recorded_time ASC;
      `,
      [pollId]
    );

    res.json(rows);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ error: "Error fetching vote history" });
  }
});

// --- Live stream (SSE) endpoint ---
router.get("/live-stream/:pollId", async (req, res) => {
  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  const pollId = req.params.pollId;
  const intervalParam = req.query.interval || "15m";
  const sqlInterval = intervalMap[intervalParam as keyof typeof intervalMap] || "15 minutes";

  const sendUpdates = async () => {
    try {
      const { rows } = await pool.query(
        `
        WITH time_series AS (
          SELECT generate_series(
            NOW() - INTERVAL '${sqlInterval}',
            NOW(),
            INTERVAL '1 minute'
          ) AS recorded_time
        )
        SELECT 
          t.recorded_time,
          c.id AS competitor_id,
          COALESCE((
            SELECT COUNT(*) 
            FROM vote_history vh
            WHERE vh.competitor_id = c.id
              AND vh.poll_id = $1
              AND vh.recorded_at <= t.recorded_time
          ), 0) AS cumulative_votes
        FROM time_series t
        CROSS JOIN poll_competitors c
        ORDER BY t.recorded_time ASC;
        `,
        [pollId]
      );

      res.write(`data: ${JSON.stringify(rows)}\n\n`);
    } catch (err) {
      console.error("Live stream error:", err);
      res.write(`data: ${JSON.stringify({ error: "Error fetching data" })}\n\n`);
    }
  };

  const interval = setInterval(sendUpdates, 15000);
  sendUpdates();

  req.on("close", () => clearInterval(interval));
});

export default router;
