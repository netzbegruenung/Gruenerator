-- Skip-to-content link toggle (Einstellungen → Barrierefreiheit), off by default
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_skip_link BOOLEAN NOT NULL DEFAULT FALSE;
