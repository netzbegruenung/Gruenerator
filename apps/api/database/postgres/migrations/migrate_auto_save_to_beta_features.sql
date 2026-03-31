-- Migration: Move auto_save_on_export to beta_features JSONB
-- Safe to run even if column was already dropped (guards with column check).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'auto_save_on_export'
  ) THEN
    UPDATE profiles
    SET beta_features = jsonb_set(
      COALESCE(beta_features, '{}'::jsonb),
      '{autoSaveOnExport}',
      'true'::jsonb,
      true
    )
    WHERE auto_save_on_export = true;
  END IF;
END $$;
