import bcrypt from "bcryptjs";
import pool from "../config-db";

/**
 * Creates a default admin user if none exists
 */
export async function seedAdminUser() {
  try {
    // Check if any admin user exists
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (adminCheck.rows.length > 0) {
      console.log("✅ Admin user already exists");
      return;
    }

    // Create default admin user
    const defaultEmail = process.env.ADMIN_EMAIL || "admin@politrack.com";
    const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
    const defaultName = process.env.ADMIN_NAME || "Admin User";

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    await pool.query(
      `INSERT INTO users (email, password, name, role, email_verified)
       VALUES ($1, $2, $3, $4, $5)`,
      [defaultEmail, hashedPassword, defaultName, "admin", true]
    );

    console.log("✅ Default admin user created:");
    console.log(`   Email: ${defaultEmail}`);
    console.log(`   Password: ${defaultPassword}`);
    console.log("   ⚠️  Please change this password in production!");
  } catch (error) {
    console.error("❌ Error seeding admin user:", error);
  }
}
