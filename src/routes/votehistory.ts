import express from "express";
import pool from "../config-db";

 const router = express.Router();

router.get("/live-stream/:pollId", async (req, res) => {
  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const pollId = req.params.pollId;
  const intervalParam = req.query.interval || "15m"; // Default: 15 minutes

  // Convert the interval to SQL duration
  const intervalMap = {
    "15m": "15 minutes",
    "1h": "1 hour",
    "1d": "1 day",
  };
  const sqlInterval = intervalMap[intervalParam as keyof typeof intervalMap] || "15 minutes";

  const sendUpdates = async () => {
    try {
      const { rows } = await pool.query(
        `
        SELECT 
          competitor_id, 
          SUM(vote_count) AS vote_count,
          DATE_TRUNC('minute', recorded_at) AS recorded_time
        FROM vote_history
        WHERE poll_id = $1
          AND recorded_at >= NOW() - INTERVAL '${sqlInterval}'
        GROUP BY competitor_id, recorded_time
        ORDER BY recorded_time ASC
        `,
        [pollId]
      );

      res.write(`data: ${JSON.stringify(rows)}\n\n`);
    } catch (err) {
      console.error("Live stream error:", err);
      res.write(`data: ${JSON.stringify({ error: "Error fetching data" })}\n\n`);
    }
  };

  // send updates every 15 seconds
  const interval = setInterval(sendUpdates, 15000);
  sendUpdates();

  req.on("close", () => {
    clearInterval(interval);
  });
});

export default router;