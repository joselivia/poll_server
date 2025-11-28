import express from "express";
import bcrypt from "bcrypt";
import pool from "../../config-db";
import { transporter } from "../Otp/mail";

const router = express.Router();
router.post("/login-request", async (req, res) => {
  const { email, password } = req.body;
  console.log("Server Received Login Request Body:", req.body);
  try {
    const result = await pool.query(
      "SELECT * FROM login WHERE email = $1",
      [email]
    );
console.log("Server Querying DB for email:", email);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + (Number(process.env.OTP_EXPIRATION_MINUTES) * 60000));
    await pool.query("DELETE FROM admin_otps WHERE email = $1", [email]);

    await pool.query(
      "INSERT INTO admin_otps (email, otp, expires_at) VALUES ($1, $2, $3)",
      [email, otp, expiresAt]
    );

    // send email
    await transporter.sendMail({
      from: `"PolitrackAfrica" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your Login OTP",
      html: `
        <h3>Your OTP Code</h3>
        <p style="font-size: 20px; font-weight: bold;">${otp}</p>
        <p>Expires in ${process.env.OTP_EXPIRATION_MINUTES} minutes.</p>
      `,
    });

    console.log(`📩 OTP sent to ${email}: ${otp}`);
    return res.status(200).json({ message: "OTP sent to email" });

  } catch (error) {
    console.error("❌ OTP request error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM admin_otps WHERE email = $1 AND otp = $2",
      [email, otp]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const record = result.rows[0];

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // OTP is valid → allow login
    await pool.query("DELETE FROM admin_otps WHERE email = $1", [email]);

    return res.status(200).json({
      message: "OTP verified, login successful",
      token: "GENERATE_YOUR_JWT_HERE"
    });

  } catch (error) {
    console.error("❌ OTP verification error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
