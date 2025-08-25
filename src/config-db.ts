import { Pool } from "pg";
import dotenv from "dotenv";
import { insertAdmin } from "./routes/admin";

dotenv.config();
// export const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
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
  constituency TEXT ,
  ward TEXT ,
  total_votes INTEGER DEFAULT 0,
  spoiled_votes INTEGER DEFAULT 0,
  voting_expires_at TIMESTAMP,
  allow_multiple_votes BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
    `CREATE TABLE IF NOT EXISTS poll_competitors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      party TEXT,
      profile_image BYTEA,
      poll_id INT REFERENCES polls(id) ON DELETE CASCADE
    );`,
  `CREATE TABLE IF NOT EXISTS votes (
  id SERIAL PRIMARY KEY,
  voter_id TEXT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  competitor_id INTEGER NOT NULL REFERENCES poll_competitors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`,
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
 
  `CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_data BYTEA[],
  video_data BYTEA[],
  pdf_data bytea[],
  created_at TIMESTAMP DEFAULT NOW()
);`,
    `CREATE TABLE IF NOT EXISTS poll_responses (
    id SERIAL PRIMARY KEY,
    poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    respondent_name TEXT,
    respondent_age INT,
    respondent_gender TEXT,
    user_identifier TEXT NOT NULL, 
    question_id INT NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
    selected_competitor_id INT REFERENCES poll_competitors(id) ON DELETE CASCADE,
    selected_option_id INT REFERENCES poll_options(id) ON DELETE CASCADE, 
    open_ended_response TEXT,
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`,
`CREATE TABLE IF NOT EXISTS login(
id SERIAL PRIMARY KEY,
email TEXT NOT NULL,
password TEXT NOT NULL
)`,
  ];

  try {
    for (const query of queries) {
      await pool.query(query);
    }
    console.log("✅ All tables are created successfully!");

    await insertAdmin();
  } catch (error: Error | any) {
    console.error("❌ Error creating tables:", error);
  }
};
createTables();
export default pool;
