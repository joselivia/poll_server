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
dotenv.config();

const app = express();
const port = process.env.PORT || 8082;
app.use(cors());
app.use(express.json());
app.use("/api/polls", pollRoutes);
app.use("/api", postRoutes);
app.use("/login", login);
app.use("/aspirant", aspirant);
app.use("/api/votes", votes);
app.use("/update-admin", updateAdmin);

pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
  } else {
    console.log("✅ Database connected successfully:", res.rows[0].now);
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
