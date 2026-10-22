-- Moderation for public Agents, Rezepte and Vorlagen, as on studio_assets
-- (zz_20261014_studio_assets.sql): reports auto-hide at three distinct
-- reporters, an admin restores or removes. Public listings require 'ok';
-- link access only refuses 'removed'; owners always see their own rows.
ALTER TABLE user_agents
    ADD COLUMN IF NOT EXISTS moderation TEXT NOT NULL DEFAULT 'ok'
        CHECK (moderation IN ('ok', 'hidden', 'removed'));

ALTER TABLE user_text_forms
    ADD COLUMN IF NOT EXISTS moderation TEXT NOT NULL DEFAULT 'ok'
        CHECK (moderation IN ('ok', 'hidden', 'removed'));

ALTER TABLE user_templates
    ADD COLUMN IF NOT EXISTS moderation TEXT NOT NULL DEFAULT 'ok'
        CHECK (moderation IN ('ok', 'hidden', 'removed'));

CREATE INDEX IF NOT EXISTS idx_user_agents_public_listing
    ON user_agents (locale, created_at)
    WHERE is_public = TRUE AND share_mode = 'authenticated' AND moderation = 'ok'
      AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_templates_public_listing
    ON user_templates (audience, created_at DESC)
    WHERE is_private = FALSE AND status = 'published' AND moderation = 'ok'
      AND deleted_at IS NULL;
