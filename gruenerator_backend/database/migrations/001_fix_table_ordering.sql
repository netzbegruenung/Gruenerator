-- Migration: Fix table ordering issue
-- Description: This migration ensures tables are created in the correct order to satisfy foreign key constraints
-- Date: 2025-09-04

-- This migration handles the case where the documents table was created before the groups table
-- causing foreign key constraint issues

BEGIN;

-- Create groups table if it doesn't exist (should be created before documents)
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    join_token TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    group_type TEXT DEFAULT 'standard',
    settings JSONB DEFAULT '{}',
    -- Wolke integration for groups
    wolke_share_links JSONB DEFAULT '[]'
);

-- Add group_id column to documents table if it doesn't exist
ALTER TABLE documents ADD COLUMN IF NOT EXISTS group_id UUID;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'documents_group_id_fkey' 
        AND table_name = 'documents'
    ) THEN
        ALTER TABLE documents ADD CONSTRAINT documents_group_id_fkey 
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_documents_group_id ON documents(group_id);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_join_token ON groups(join_token) WHERE join_token IS NOT NULL;

COMMIT;