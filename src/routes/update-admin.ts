import express from "express";
import bcrypt from "bcrypt";
import pool from "../config-db"; 
const router = express.Router();

router.put("/", async (req, res) => {
  const { currentEmail, currentPassword, newEmail, newPassword } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM login WHERE email = $1",
      [currentEmail]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const admin = result.rows[0];

    // 2. Validate current password
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect current password" });
    }

    // 3. Prepare new values
    const updatedPassword = newPassword
      ? await bcrypt.hash(newPassword, 10)
      : admin.password;

    const updatedEmail = newEmail || admin.email;

    // 4. Update admin
    await pool.query(
      "UPDATE login SET email = $1, password = $2 WHERE email = $3",
      [updatedEmail, updatedPassword, currentEmail]
    );

    // 5. Remove old OTP entries for both old + new email
    await pool.query("DELETE FROM admin_otps WHERE email = $1", [currentEmail]);
    console.log("✅ Admin credentials updated successfully");

    return res.status(200).json({
      message: "Admin credentials updated successfully",
      updatedEmail,
    });

  } catch (error) {
    console.error("❌ Error updating admin credentials:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
