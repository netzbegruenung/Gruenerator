-- Visual-accessibility preferences (Einstellungen → Allgemein)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reduce_motion BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reduce_transparency BOOLEAN NOT NULL DEFAULT FALSE;
