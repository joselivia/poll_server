import { pool } from "../config-db";
import bcrypt from "bcrypt";
export async function insertAdmin() {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM login");
    const count = Number(result.rows[0].count);

    if (count > 0) {
      console.log("Admin already exists.");
      return;
    }

    const defaultEmail = "admin@example.com";
    const rawPassword = "admin123";
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    await pool.query(
      "INSERT INTO login (email, password) VALUES ($1, $2)",
      [defaultEmail, hashedPassword]
    );

    console.log("✅ Default admin created once");

  } catch (err) {
    console.error("Error inserting admin:", err);
  }
}


