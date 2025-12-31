-- Migration: Add locale column to profiles table
-- Date: 2025-01-20

BEGIN;

-- Add locale column to profiles table
ALTER TABLE profiles
ADD COLUMN locale TEXT DEFAULT 'de-DE'
CHECK (locale IN ('de-DE', 'de-AT'));

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_locale ON profiles(locale);

-- Update existing users to have default locale
UPDATE profiles SET locale = 'de-DE' WHERE locale IS NULL;

COMMIT;