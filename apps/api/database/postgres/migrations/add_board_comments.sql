-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Board Comments & Reactions
-- Moves board card comments from JSON cells to proper relational tables.
-- Enables threading (1-level), emoji reactions, mentions, and notifications.
-- ════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Table: board_comments
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS board_comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id    UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    card_id     TEXT NOT NULL,
    parent_id   UUID REFERENCES board_comments(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content     TEXT,
    blocks      JSONB NOT NULL DEFAULT '[]'::jsonb,
    mentioned_user_ids UUID[] DEFAULT '{}',
    is_edited   BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE board_comments IS 'Threaded comments on board cards (1-level nesting via parent_id)';
COMMENT ON COLUMN board_comments.card_id IS 'Row ID from the Yjs board data (e.g. row-1234567890-abc12)';
COMMENT ON COLUMN board_comments.content IS 'Plain text extracted from blocks for full-text search';
COMMENT ON COLUMN board_comments.blocks IS 'Array of content blocks. Types: text, mention, link, code';
COMMENT ON COLUMN board_comments.mentioned_user_ids IS 'Extracted user IDs from mention blocks for notification fan-out';

CREATE TRIGGER set_board_comments_updated_at
    BEFORE UPDATE ON board_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────
-- Table: board_comment_reactions
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS board_comment_reactions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id  UUID NOT NULL REFERENCES board_comments(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (comment_id, user_id, emoji)
);

COMMENT ON TABLE board_comment_reactions IS 'Emoji reactions on board comments (one per user+emoji combo)';

-- ──────────────────────────────────────────────────────────────────────────
-- Indexes: board_comments
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX idx_board_comments_board_card
    ON board_comments (board_id, card_id, created_at);

CREATE INDEX idx_board_comments_parent
    ON board_comments (parent_id)
    WHERE parent_id IS NOT NULL;

CREATE INDEX idx_board_comments_user
    ON board_comments (user_id);

CREATE INDEX idx_board_comments_mentioned
    ON board_comments USING gin (mentioned_user_ids)
    WHERE mentioned_user_ids != '{}';

-- ──────────────────────────────────────────────────────────────────────────
-- Indexes: board_comment_reactions
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX idx_board_comment_reactions_comment
    ON board_comment_reactions (comment_id);
