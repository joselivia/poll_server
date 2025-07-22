import { Pool } from "pg";
import dotenv from "dotenv";
 
dotenv.config(); 
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }, 
});
//export const pool = new Pool({user: "postgres", password: "@Joselivia254", host: "localhost", port: 5432, database: "polling"});

const createTables = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  profile BYTEA,
  title TEXT NOT NULL,
  presidential TEXT,
  category TEXT,
  region TEXT,
  county TEXT,
  constituency TEXT,
  ward TEXT,
  party TEXT,
  spoiled_votes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
`,
    `CREATE TABLE IF NOT EXISTS competitors (
      id SERIAL PRIMARY KEY,
      profile BYTEA,
      name TEXT NOT NULL,
      party Text,
      poll_id INT REFERENCES polls(id)
    );`,

    `CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      competitor_id INT REFERENCES competitors(id),
      voted_at TIMESTAMP DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_data BYTEA[],
  video_data BYTEA[],
  created_at TIMESTAMP DEFAULT NOW()
);`,
    `CREATE TABLE IF NOT EXISTS survey_responses (
    id SERIAL PRIMARY KEY,
    poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE, 
    name TEXT,
    gender TEXT NOT NULL,
    age INT NOT NULL,
    answers JSONB NOT NULL, 
    submitted_at TIMESTAMP DEFAULT NOW()
);
`,
  ];

  try {
    for (const query of queries) {
      await pool.query(query);
    }
    console.log("✅ All tables are created successfully!");
  } catch (error: Error | any) {
    console.error("❌ Error creating tables:", error);
  }
};

createTables();
export default pool;
