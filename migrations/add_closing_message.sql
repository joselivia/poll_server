-- Add closing_message column to polls table
-- This allows admins to add a custom message with hashtags displayed at the end of voting forms

ALTER TABLE polls ADD COLUMN closing_message TEXT;
