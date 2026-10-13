-- Comments and emoji reactions on user agents (Agentura detail page).
CREATE TABLE IF NOT EXISTS agent_comments (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id   UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    body       TEXT NOT NULL,
    parent_id  UUID REFERENCES agent_comments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_comments_agent ON agent_comments(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_comments_parent ON agent_comments(parent_id) WHERE parent_id IS NOT NULL;

ALTER TABLE entity_reactions ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES user_agents(id) ON DELETE CASCADE;
ALTER TABLE entity_reactions ADD COLUMN IF NOT EXISTS agent_comment_id UUID REFERENCES agent_comments(id) ON DELETE CASCADE;

ALTER TABLE entity_reactions DROP CONSTRAINT IF EXISTS entity_reactions_one_target;
ALTER TABLE entity_reactions ADD CONSTRAINT entity_reactions_one_target
    CHECK (num_nonnulls(group_share_id, group_comment_id, board_comment_id, agent_id, agent_comment_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_agent
    ON entity_reactions (agent_id, user_id, emoji) WHERE agent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_agent_comment
    ON entity_reactions (agent_comment_id, user_id, emoji) WHERE agent_comment_id IS NOT NULL;
