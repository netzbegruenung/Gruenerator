-- Studio: user-uploaded Sticker and Hintergründe. The image is a shared_media
-- row (source 'studio-asset'); this row carries the shop metadata. Public
-- items are visible in the shop at once, moderation happens through reports.
CREATE TABLE IF NOT EXISTS studio_assets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('sticker', 'background')),
    title       TEXT NOT NULL CHECK (char_length(title) <= 120),
    tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
    media_id    UUID NOT NULL REFERENCES shared_media(id) ON DELETE CASCADE,
    src         TEXT NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    source      TEXT NOT NULL CHECK (source IN ('upload', 'cutout', 'badge')),
    visibility  TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    was_public  BOOLEAN NOT NULL DEFAULT FALSE,
    audience    TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('de-DE', 'de-AT', 'all')),
    moderation  TEXT NOT NULL DEFAULT 'ok' CHECK (moderation IN ('ok', 'hidden', 'removed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_studio_assets_user_created
    ON studio_assets (user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_studio_assets_shop
    ON studio_assets (kind, audience, created_at DESC)
    WHERE visibility = 'public' AND moderation = 'ok' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_studio_assets_trashed
    ON studio_assets (deleted_at) WHERE deleted_at IS NOT NULL;
