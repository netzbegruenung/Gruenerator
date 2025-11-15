-- Migration: Move auto_save_on_export to beta_features
-- Date: 2025-11-15
-- Description: Migrates existing auto_save_on_export boolean field to beta_features JSONB

-- Step 1: Migrate existing users with auto_save_on_export = true to beta features
-- Updates the beta_features JSONB column to include autoSaveOnExport key
UPDATE profiles
SET beta_features = jsonb_set(
  COALESCE(beta_features, '{}'::jsonb),
  '{autoSaveOnExport}',
  'true'::jsonb,
  true
)
WHERE auto_save_on_export = true;

-- Step 2 (Optional): Drop the old column
-- Uncomment the following line to permanently remove the auto_save_on_export column
-- ALTER TABLE profiles DROP COLUMN IF EXISTS auto_save_on_export;

-- Verification query (run after migration):
-- SELECT id, display_name, auto_save_on_export, beta_features->>'autoSaveOnExport' as beta_auto_save
-- FROM profiles
-- WHERE auto_save_on_export = true OR beta_features->>'autoSaveOnExport' = 'true';
