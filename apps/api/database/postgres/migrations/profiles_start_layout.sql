-- How `/start` is laid out (Settings → Allgemein → Startseite):
--   'combined' → one page: the chat composer on top of Arbeiten (default)
--   'tabs'     → Chat and Arbeiten as two views with tabs on top
-- Targets the profiles table, which is created by schema.sql, so ordering
-- against other migrations is irrelevant.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS start_layout TEXT NOT NULL DEFAULT 'combined'
  CHECK (start_layout IN ('tabs', 'combined'));
