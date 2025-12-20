-- Add location_responses column to poll_responses table
-- This column will store location responses as JSON arrays
-- Format: [{"questionId": number, "latitude": number, "longitude": number}]

ALTER TABLE poll_responses 
ADD COLUMN IF NOT EXISTS location_responses JSONB;

-- Add comment to explain the column structure
COMMENT ON COLUMN poll_responses.location_responses IS 
'Stores location responses as JSONB array. Format: [{"questionId": 123, "latitude": 40.7128, "longitude": -74.0060}]';
