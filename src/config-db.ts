import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();
// export const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: { rejectUnauthorized: false },
// });
export const pool = new Pool({
  user: "postgres",
  password: "@Joselivia254",
  host: "localhost",
  port: 5432,
  database: "polling",
});

const createTables = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  presidential TEXT,
  region TEXT NOT NULL,
  county TEXT NOT NULL,
  constituency TEXT NOT NULL,
  ward TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
    `CREATE TABLE IF NOT EXISTS poll_competitors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      party TEXT,
      profile_image BYTEA,
      poll_id INT REFERENCES polls(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS poll_questions (
      id SERIAL PRIMARY KEY,
      poll_id INT REFERENCES polls(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      is_competitor_question BOOLEAN DEFAULT false,
      question_text TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS poll_options (
      id SERIAL PRIMARY KEY,
      question_id INT REFERENCES poll_questions(id) ON DELETE CASCADE,
      option_text TEXT NOT NULL
    );
`,
 
    `CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      competitor_id INT REFERENCES poll_competitors(id),
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
    `CREATE TABLE IF NOT EXISTS poll_responses (
    id SERIAL PRIMARY KEY,
    poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    respondent_name TEXT NOT NULL,
    respondent_age INT NOT NULL,
    respondent_gender TEXT NOT NULL,
    user_identifier TEXT NOT NULL, 
    question_id INT NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
    selected_competitor_id INT REFERENCES poll_competitors(id) ON DELETE CASCADE,
    selected_option_id INT REFERENCES poll_options(id) ON DELETE CASCADE, 
    open_ended_response TEXT,
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
