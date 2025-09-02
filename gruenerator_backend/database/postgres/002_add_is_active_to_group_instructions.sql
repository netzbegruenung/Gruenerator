-- Migration: Add is_active column to group_instructions table
-- Date: 2025-01-27
-- Description: Adds missing is_active column that the code expects to exist

-- Add the is_active column with default value TRUE
ALTER TABLE group_instructions 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Set all existing records to active
UPDATE group_instructions 
SET is_active = TRUE 
WHERE is_active IS NULL;

-- Add index for performance on frequently queried column
CREATE INDEX IF NOT EXISTS idx_group_instructions_is_active ON group_instructions(is_active);

-- Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_group_instructions_group_active ON group_instructions(group_id, is_active);

-- Verify the migration by checking column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'group_instructions' 
        AND column_name = 'is_active'
    ) THEN
        RAISE EXCEPTION 'Migration failed: is_active column not found in group_instructions table';
    END IF;
    
    RAISE NOTICE 'Migration completed successfully: is_active column added to group_instructions table';
END $$;