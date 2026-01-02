-- Migration: Change blog_posts media columns from bytea to text for URL storage
-- Date: 2026-01-02

-- Step 1: Backup existing data (optional, in case you have existing posts)
-- If you have existing posts with binary data, you may want to export them first

-- Step 2: Drop old columns and create new ones with text type
ALTER TABLE blog_posts 
  DROP COLUMN IF EXISTS image_data,
  DROP COLUMN IF EXISTS video_data,
  DROP COLUMN IF EXISTS pdf_data;

-- Step 3: Add new columns to store JSON arrays of URLs
ALTER TABLE blog_posts
  ADD COLUMN image_data JSONB,
  ADD COLUMN video_data JSONB,
  ADD COLUMN pdf_data JSONB;

-- Optional: Add comments to document the schema
COMMENT ON COLUMN blog_posts.image_data IS 'JSON array of image URLs';
COMMENT ON COLUMN blog_posts.video_data IS 'JSON array of video URLs';
COMMENT ON COLUMN blog_posts.pdf_data IS 'JSON array of PDF URLs';
