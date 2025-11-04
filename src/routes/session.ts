// import jwt from "jsonwebtoken";
// import uaParser from "ua-parser-js";
// import express from "express";
// import pool from "../config-db";
// const router = express.Router();
// router.post("/api/login", async (req, res) => {
//   const { email, password } = req.body;
//   const user = await verifyUser(email, password);
//   if (!user) return res.status(401).json({ message: "Invalid credentials" });

//   const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
//   const ua = uaParser(req.headers["user-agent"]);
//   const ip = req.ip;

//   await pool.query(
//     `INSERT INTO sessions (user_id, token, user_agent, ip_address)
//      VALUES ($1, $2, $3, $4)`,
//     [user.id, token, `${ua.browser.name} on ${ua.os.name}`, ip]
//   );

//   res.json({ token });
// });
// export default router;