-- Migration: Update groups schema for userGroups.mjs compatibility
-- Date: 2025-08-24

-- Enable dotenv if needed for environment variables
-- This migration updates the PostgreSQL schema to match Supabase structure used in userGroups.mjs

BEGIN;

-- 1. Add join_token to groups table for invitation links
ALTER TABLE groups ADD COLUMN IF NOT EXISTS join_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_join_token ON groups(join_token) WHERE join_token IS NOT NULL;

-- 2. Fix group_content_shares table to match userGroups.mjs expectations
-- Rename columns to match the code
DO $$
BEGIN
    -- Check if old column exists before renaming
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'group_content_shares' AND column_name = 'shared_by') THEN
        ALTER TABLE group_content_shares RENAME COLUMN shared_by TO shared_by_user_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'group_content_shares' AND column_name = 'share_permissions') THEN
        ALTER TABLE group_content_shares RENAME COLUMN share_permissions TO permissions;
    END IF;
END $$;

-- Add shared_at column if it doesn't exist
ALTER TABLE group_content_shares ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 3. Completely restructure group_instructions table to match userGroups.mjs
-- The current structure doesn't match what the code expects

-- Drop existing group_instructions table and recreate with correct structure
DROP TABLE IF EXISTS group_instructions CASCADE;

CREATE TABLE group_instructions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    custom_antrag_prompt TEXT DEFAULT '',
    custom_social_prompt TEXT DEFAULT '',
    antrag_instructions_enabled BOOLEAN DEFAULT FALSE,
    social_instructions_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id) -- Only one instructions record per group
);

-- Add trigger for updating updated_at
CREATE TRIGGER update_group_instructions_updated_at 
    BEFORE UPDATE ON group_instructions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Update indexes for better performance
CREATE INDEX IF NOT EXISTS idx_group_content_shares_group_content ON group_content_shares(group_id, content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_group_content_shares_shared_by ON group_content_shares(shared_by_user_id);

-- 5. Add any missing indexes for groups functionality
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_group_knowledge_group_id ON group_knowledge(group_id);
CREATE INDEX IF NOT EXISTS idx_group_instructions_group_id ON group_instructions(group_id);

COMMIT;

-- Verification queries to run after migration:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'groups' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'group_instructions' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'group_content_shares' ORDER BY ordinal_position;