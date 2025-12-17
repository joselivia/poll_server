-- Add columns for image uploads and audio recordings to poll_responses table

ALTER TABLE poll_responses 
ADD COLUMN IF NOT EXISTS image_uploads JSONB,
ADD COLUMN IF NOT EXISTS audio_recordings JSONB;

-- Add comment to explain the structure
COMMENT ON COLUMN poll_responses.image_uploads IS 'Array of objects with questionId and url: [{questionId: number, url: string}]';
COMMENT ON COLUMN poll_responses.audio_recordings IS 'Array of objects with questionId and url: [{questionId: number, url: string}]';

-- Also add to admin bulk responses table for consistency
ALTER TABLE poll_responses_admin 
ADD COLUMN IF NOT EXISTS image_urls JSONB,
ADD COLUMN IF NOT EXISTS audio_urls JSONB;

COMMENT ON COLUMN poll_responses_admin.image_urls IS 'Array of image URLs for this question';
COMMENT ON COLUMN poll_responses_admin.audio_urls IS 'Array of audio URLs for this question';
