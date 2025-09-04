-- Migration: Fix table ordering issue (DISABLED - CAUSING HANGS)
-- Description: This migration ensures tables are created in the correct order to satisfy foreign key constraints
-- Date: 2025-09-04
-- Status: TEMPORARILY DISABLED due to hanging issues during foreign key constraint creation
-- Note: These changes are already handled by schema.sql, so this migration is redundant

-- MIGRATION DISABLED - ALL CONTENT COMMENTED OUT TO PREVENT HANGING

-- -- Ensure UUID extension is available (required for uuid_generate_v4)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -- Create groups table if it doesn't exist (should be created before documents)
-- -- Remove explicit transaction to prevent hanging on large datasets
-- CREATE TABLE IF NOT EXISTS groups (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     name TEXT NOT NULL,
--     description TEXT,
--     created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
--     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
--     join_token TEXT,
--     is_active BOOLEAN DEFAULT TRUE,
--     group_type TEXT DEFAULT 'standard',
--     settings JSONB DEFAULT '{}',
--     -- Wolke integration for groups
--     wolke_share_links JSONB DEFAULT '[]'
-- );

-- -- Add group_id column to documents table if it doesn't exist
-- -- Use separate statement to avoid transaction issues
-- ALTER TABLE documents ADD COLUMN IF NOT EXISTS group_id UUID;

-- -- Add foreign key constraint if it doesn't exist (with NOT VALID to avoid full table scan)
-- DO $$
-- BEGIN
--     IF NOT EXISTS (
--         SELECT 1 FROM information_schema.table_constraints 
--         WHERE constraint_name = 'documents_group_id_fkey' 
--         AND table_name = 'documents'
--     ) THEN
--         -- Add constraint as NOT VALID first to avoid full table scan during migration
--         ALTER TABLE documents ADD CONSTRAINT documents_group_id_fkey 
--         FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL NOT VALID;
--         
--         -- Validate the constraint in a separate step (can be done later if needed)
--         -- ALTER TABLE documents VALIDATE CONSTRAINT documents_group_id_fkey;
--     END IF;
-- END $$;

-- -- Create indexes if they don't exist (these are fast operations)
-- CREATE INDEX IF NOT EXISTS idx_documents_group_id ON documents(group_id);
-- CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
-- CREATE INDEX IF NOT EXISTS idx_groups_join_token ON groups(join_token) WHERE join_token IS NOT NULL;