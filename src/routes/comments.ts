import express from "express";
import { pool } from "../config-db";

const router = express.Router();

// 🟢 POST: Add a comment for a specific poll
router.post("/", async (req, res) => {
  try {
    const { name, comment, poll_id } = req.body;

    if (!name || !comment || !poll_id) {
      return res.status(400).json({ error: "Name, comment, and poll_id are required" });
    }

    const result = await pool.query(
      "INSERT INTO comments (name, comment, poll_id, likes) VALUES ($1, $2, $3,0) RETURNING *",
      [name, comment, poll_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 🟡 GET: Fetch comments only for a given poll
router.get("/:poll_id", async (req, res) => {
  const { poll_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM comments WHERE poll_id = $1 ORDER BY id DESC",
      [poll_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 🔵 PUT: Like a comment
router.put("/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const { likes } = req.body;

    const result = await pool.query(
      "UPDATE comments SET likes = $1 WHERE id = $2 RETURNING *",
      [likes, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating likes:", error);
    res.status(500).json({ error: "Error updating likes" });
  }
});

export default router;
