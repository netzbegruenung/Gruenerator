-- Add audience (locale) targeting to user templates so the Vorlagen gallery can
-- be filtered by de-DE / de-AT, mirroring how groups and notebooks are scoped.
-- New templates are tagged with their creator's locale on insert; the gallery
-- shows rows whose audience matches the viewer's locale (plus 'all') unless the
-- user turns the locale filter off. No backfill needed — the gallery is empty
-- after the system-template removal.

ALTER TABLE user_templates
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all';

ALTER TABLE user_templates
  DROP CONSTRAINT IF EXISTS valid_template_audience;
ALTER TABLE user_templates
  ADD CONSTRAINT valid_template_audience CHECK (audience IN ('de-DE', 'de-AT', 'all'));

CREATE INDEX IF NOT EXISTS idx_user_templates_audience ON user_templates(audience);
