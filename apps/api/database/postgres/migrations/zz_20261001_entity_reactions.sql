CREATE TABLE IF NOT EXISTS entity_reactions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    emoji            TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    group_share_id   UUID REFERENCES group_content_shares(id) ON DELETE CASCADE,
    group_comment_id UUID REFERENCES group_share_comments(id) ON DELETE CASCADE,
    board_comment_id UUID REFERENCES board_comments(id) ON DELETE CASCADE,
    CONSTRAINT entity_reactions_one_target
        CHECK (num_nonnulls(group_share_id, group_comment_id, board_comment_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_group_share
    ON entity_reactions (group_share_id, user_id, emoji) WHERE group_share_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_group_comment
    ON entity_reactions (group_comment_id, user_id, emoji) WHERE group_comment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_board_comment
    ON entity_reactions (board_comment_id, user_id, emoji) WHERE board_comment_id IS NOT NULL;

INSERT INTO entity_reactions (board_comment_id, user_id, emoji, created_at)
SELECT comment_id, user_id, emoji, created_at
FROM board_comment_reactions
ON CONFLICT DO NOTHING;
