-- Add labor_enabled column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS labor_enabled BOOLEAN DEFAULT FALSE;