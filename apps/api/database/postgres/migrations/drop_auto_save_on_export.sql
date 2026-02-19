-- Migration: Drop deprecated auto_save_on_export feature
-- Date: 2026-02-19
-- Description: Removes the auto_save_on_export column and beta_features JSONB key.
--   The autoSaveGenerated feature (default ON) supersedes autoSaveOnExport,
--   making save-on-export redundant.

-- Step 1: Drop the dedicated boolean column
ALTER TABLE profiles DROP COLUMN IF EXISTS auto_save_on_export;

-- Step 2: Remove the key from the beta_features JSONB column
UPDATE profiles
SET beta_features = beta_features - 'autoSaveOnExport'
WHERE beta_features ? 'autoSaveOnExport';
