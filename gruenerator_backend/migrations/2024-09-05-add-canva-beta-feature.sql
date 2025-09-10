-- Migration: Add canva beta feature column to profiles table
-- This migration adds the new canva column to support Canva as a beta feature

-- Add the canva column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS canva BOOLEAN DEFAULT FALSE;

-- Update any existing profiles to set canva to false by default
-- (this is already the default, but being explicit for clarity)
UPDATE profiles SET canva = FALSE WHERE canva IS NULL;

-- Optional: If you want to enable Canva for all users who previously had content_management enabled
-- Uncomment the next line if you want this behavior:
-- UPDATE profiles SET canva = TRUE WHERE content_management = TRUE;

-- Add an index for performance on beta feature queries
CREATE INDEX IF NOT EXISTS idx_profiles_canva ON profiles(canva);

-- Add a comment to document the column
COMMENT ON COLUMN profiles.canva IS 'Beta feature flag for Canva integration functionality';