import { Pool } from "pg";
import dotenv from "dotenv";
import { seedAdminUser } from "./lib/seedAdmin";

dotenv.config();
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
// export const pool = new Pool({
//   user: "postgres",
//   password: "@Joselivia254",
//   host: "localhost",
//   port: 5432,
//   database: "polling",
// });
const createTables = async () => {
  const queries = [
    // Users table for authentication
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'enumerator', 'client')),
      email_verified BOOLEAN DEFAULT false,
      image TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // Sessions table for better-auth
    `CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // Verification tokens table
    `CREATE TABLE IF NOT EXISTS verification_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  presidential TEXT,
  region TEXT NOT NULL,
  county TEXT,
  constituency TEXT ,
  ward TEXT ,
  total_votes INTEGER DEFAULT 0,
  spoiled_votes INTEGER DEFAULT 0,
  voting_expires_at TIMESTAMP,
  allow_multiple_votes BOOLEAN DEFAULT false,
  published BOOLEAN DEFAULT false, 
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
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  region TEXT ,
  county TEXT,
  constituency TEXT,
  ward TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`,
    `CREATE TABLE IF NOT EXISTS poll_questions (
      id SERIAL PRIMARY KEY,
      poll_id INT REFERENCES polls(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      is_competitor_question BOOLEAN DEFAULT false,
      published BOOLEAN DEFAULT false, 
      question_text TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS poll_options (
      id SERIAL PRIMARY KEY,
      question_id INT REFERENCES poll_questions(id) ON DELETE CASCADE,
      option_text TEXT NOT NULL
    );
`,
    `CREATE TABLE IF NOT EXISTS vote_history (
  id SERIAL PRIMARY KEY,
  poll_id INT REFERENCES polls(id) ON DELETE CASCADE,
  competitor_id INT REFERENCES poll_competitors(id) ON DELETE CASCADE,
  vote_count INT,
  recorded_at TIMESTAMP DEFAULT NOW()
);
`,
    `CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_data JSONB,
  video_data JSONB,
  pdf_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);`,
    `CREATE TABLE IF NOT EXISTS poll_responses (
    id SERIAL PRIMARY KEY,
    poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    respondent_name TEXT,
    respondent_age INT,
    respondent_gender TEXT,
    region TEXT ,
  county TEXT,
  constituency TEXT,
  ward TEXT,
    user_identifier TEXT NOT NULL,
    selected_option_ids INT[],
    selected_competitor_ids INT[],
    open_ended_responses jsonb[],
    rating jsonb[],
    image_uploads JSONB,
    audio_recordings JSONB,
    location_responses JSONB,
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`,
    `CREATE TABLE IF NOT EXISTS poll_rankings (
  id SERIAL PRIMARY KEY,
  poll_id INT REFERENCES polls(id) ON DELETE CASCADE,
  question_id INT REFERENCES poll_questions(id) ON DELETE CASCADE,
  option_id INT REFERENCES poll_options(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL,
  rank_position INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
`,


    `CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  likes INT DEFAULT 0,
 created_at TIMESTAMP DEFAULT NOW()
)
`,
    `CREATE TABLE IF NOT EXISTS poll_responses_admin (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
  option_counts JSONB DEFAULT '{}',
  competitor_counts JSONB DEFAULT '{}',
  open_ended_responses TEXT[] DEFAULT '{}',
  rating_values INTEGER[] DEFAULT '{}',
  ranking_counts JSONB DEFAULT '{}',
  image_urls JSONB,
  audio_urls JSONB,
  constituency VARCHAR(255),
  ward VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT poll_responses_admin_poll_question_location_unique 
  UNIQUE(poll_id, question_id, constituency, ward)
)
`,
    `CREATE TABLE IF NOT EXISTS poll_demographics_admin (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  gender_counts JSONB DEFAULT '{}',
  age_range_counts JSONB DEFAULT '{}',
  constituency VARCHAR(255),
  ward VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT poll_demographics_admin_poll_location_unique 
  UNIQUE(poll_id, constituency, ward)
)
`,
    `CREATE TABLE IF NOT EXISTS votes_admin (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  competitor_id INTEGER NOT NULL REFERENCES poll_competitors(id) ON DELETE CASCADE,
  vote_count INTEGER NOT NULL DEFAULT 0,
  gender_counts JSONB DEFAULT '{}',
  region VARCHAR(255),
  county VARCHAR(255),
  constituency VARCHAR(255),
  ward VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT votes_admin_poll_competitor_location_unique 
  UNIQUE(poll_id, competitor_id, constituency, ward)
)
`,

  `CREATE TABLE IF NOT EXISTS survey_requests (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  contact VARCHAR(50) NOT NULL,
  duration VARCHAR(100) NOT NULL,
  data_collection_type VARCHAR(50) NOT NULL,
  additional_notes TEXT,
  sample_size VARCHAR(50) NOT NULL,
  location_level VARCHAR(50) NOT NULL,
  selected_locations TEXT[] NOT NULL,
  other_location_request TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
`,
  ];

  try {
    for (const query of queries) {
      await pool.query(query);
    }
    console.log("✅ All tables are created successfully!");

    // Create indexes for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email 
      ON users(email)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id 
      ON sessions(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_responses_poll_question 
      ON poll_responses_admin(poll_id, question_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_responses_location 
      ON poll_responses_admin(poll_id, constituency, ward)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_demographics_admin_poll_location 
      ON poll_demographics_admin(poll_id, constituency, ward)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_votes_admin_poll_competitor 
      ON votes_admin(poll_id, competitor_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_votes_admin_location 
      ON votes_admin(poll_id, constituency, ward)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_survey_requests_status 
      ON survey_requests(status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_survey_requests_email 
      ON survey_requests(email)
    `);

    await seedAdminUser();
  } catch (error: Error | any) {
    console.error("❌ Error creating tables:", error);
  }
};
createTables();
export default pool;
