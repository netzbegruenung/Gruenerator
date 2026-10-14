-- Emoji reactions on Vorlagen comments.
ALTER TABLE entity_reactions ADD COLUMN IF NOT EXISTS template_comment_id UUID REFERENCES template_comments(id) ON DELETE CASCADE;

ALTER TABLE entity_reactions DROP CONSTRAINT IF EXISTS entity_reactions_one_target;
ALTER TABLE entity_reactions ADD CONSTRAINT entity_reactions_one_target
    CHECK (num_nonnulls(group_share_id, group_comment_id, board_comment_id, agent_id, agent_comment_id, template_comment_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_template_comment
    ON entity_reactions (template_comment_id, user_id, emoji) WHERE template_comment_id IS NOT NULL;
