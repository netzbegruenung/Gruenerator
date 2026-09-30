CREATE TABLE IF NOT EXISTS entity_reactions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_type, entity_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_entity_reactions_entity ON entity_reactions (entity_type, entity_id);

INSERT INTO entity_reactions (entity_type, entity_id, user_id, emoji, created_at)
SELECT 'board_comment', comment_id::text, user_id, emoji, created_at
FROM board_comment_reactions
ON CONFLICT DO NOTHING;
