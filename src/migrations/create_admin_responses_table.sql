-- Create admin bulk responses table
CREATE TABLE IF NOT EXISTS poll_responses_admin (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
  
  -- For single-choice, multi-choice, yes-no-notsure, competitor questions
  -- Store option/competitor ID with its count
  option_counts JSONB DEFAULT '{}', -- e.g., {"1": 50, "2": 30, "3": 20}
  competitor_counts JSONB DEFAULT '{}', -- e.g., {"1": 100, "2": 75}
  
  -- For open-ended questions - array of text responses
  open_ended_responses TEXT[] DEFAULT '{}',
  
  -- For rating questions - array of individual ratings
  rating_values INTEGER[] DEFAULT '{}',
  
  -- For ranking questions - store rank counts
  -- e.g., {"1": {"rank_1": 10, "rank_2": 5}, "2": {"rank_1": 5, "rank_2": 10}}
  ranking_counts JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(poll_id, question_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_responses_poll_question 
ON poll_responses_admin(poll_id, question_id);
