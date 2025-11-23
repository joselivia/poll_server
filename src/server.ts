import express from "express";
import cors from "cors";
import pollRoutes from "./routes/polls";
import postRoutes from "./routes/posts";
import login from "./routes/login";
import pool from "./config-db";
import aspirant from "./routes/aspirants";
import dotenv from "dotenv";
import votes from "./routes/votes";
import updateAdmin from "./routes/update-admin";
import comments from "./routes/comments";
import liveVotes from "./routes/votehistory";
import opinionsPolls from "./routes/opinion_poll";
dotenv.config();

const app = express();
const port = process.env.PORT || 8082;
app.use(cors());
app.use(express.json());

app.use("/api/polls", pollRoutes);
app.use("/api/blogs", postRoutes);
app.use("/api/login", login);
app.use("/api/aspirant", aspirant);
app.use("/api/votes", votes);
app.use("/api/update-admin", updateAdmin);
app.use("/api/comments", comments);
app.use("/api/live-votes", liveVotes);
app.use("/api/Opinions", opinionsPolls);
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
  } else {
    console.log("✅ Database connected successfully:", res.rows[0].now);
  }
});
app.use((err: any, req: any, res: any, next: any) => {
  console.error("🔥 GLOBAL ERROR CAUGHT:", err.message);
  console.error(err.stack);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message,
  });
});
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
