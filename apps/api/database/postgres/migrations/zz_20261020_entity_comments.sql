-- One comment model for every marketplace item: Agents, Rezepte, Vorlagen,
-- Sticker and Hintergründe, official items included. Items are keyed like
-- likes: `(entity_type, entity_id)` with `entity_id` = the marketplace `ref`
-- (a row uuid, a system agent identifier, a recipe mention or a catalogue
-- Vorlage id), so there is no FK; each kind's purge deletes its comments.
-- Comments are reportable: three reporters hide one, an admin restores or
-- removes it (content_reports kind 'entity_comment').
CREATE TABLE IF NOT EXISTS entity_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL
        CHECK (entity_type IN ('agent', 'recipe', 'template', 'studio_asset')),
    entity_id   TEXT NOT NULL,
    user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    body        TEXT NOT NULL,
    parent_id   UUID REFERENCES entity_comments(id) ON DELETE SET NULL,
    moderation  TEXT NOT NULL DEFAULT 'ok' CHECK (moderation IN ('ok', 'hidden', 'removed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_entity_comments_entity
    ON entity_comments (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_entity_comments_parent
    ON entity_comments (parent_id) WHERE parent_id IS NOT NULL;

-- Backfill with the same ids, so reactions, reports and links keep pointing
-- at the same comment. Parents are set afterwards: insert order is free then.
INSERT INTO entity_comments (id, entity_type, entity_id, user_id, body, created_at)
SELECT id, 'agent', agent_id::text, user_id, body, created_at FROM agent_comments
ON CONFLICT (id) DO NOTHING;

INSERT INTO entity_comments (id, entity_type, entity_id, user_id, body, created_at)
SELECT id, 'template', template_id, user_id, body, created_at FROM template_comments
ON CONFLICT (id) DO NOTHING;

UPDATE entity_comments ec SET parent_id = ac.parent_id
  FROM agent_comments ac
 WHERE ec.id = ac.id AND ac.parent_id IS NOT NULL AND ec.parent_id IS NULL;

UPDATE entity_comments ec SET parent_id = tc.parent_id
  FROM template_comments tc
 WHERE ec.id = tc.id AND tc.parent_id IS NOT NULL AND ec.parent_id IS NULL;

-- Reactions: one column for every entity comment, and the item pair for
-- reactions on the item itself (same key as comments and likes).
ALTER TABLE entity_reactions
    ADD COLUMN IF NOT EXISTS entity_comment_id UUID REFERENCES entity_comments(id) ON DELETE CASCADE;
ALTER TABLE entity_reactions ADD COLUMN IF NOT EXISTS item_type TEXT;
ALTER TABLE entity_reactions ADD COLUMN IF NOT EXISTS item_id TEXT;

ALTER TABLE entity_reactions DROP CONSTRAINT IF EXISTS entity_reactions_item_type;
ALTER TABLE entity_reactions ADD CONSTRAINT entity_reactions_item_type
    CHECK (item_type IN ('agent', 'recipe', 'template', 'studio_asset'));
ALTER TABLE entity_reactions DROP CONSTRAINT IF EXISTS entity_reactions_item_pair;
ALTER TABLE entity_reactions ADD CONSTRAINT entity_reactions_item_pair
    CHECK ((item_type IS NULL) = (item_id IS NULL));

-- Move the old targets over; the CHECK below counts the item pair as one target.
ALTER TABLE entity_reactions DROP CONSTRAINT IF EXISTS entity_reactions_one_target;

UPDATE entity_reactions
   SET entity_comment_id = agent_comment_id, agent_comment_id = NULL
 WHERE agent_comment_id IS NOT NULL;

UPDATE entity_reactions
   SET entity_comment_id = template_comment_id, template_comment_id = NULL
 WHERE template_comment_id IS NOT NULL;

UPDATE entity_reactions
   SET item_type = 'agent', item_id = agent_id::text, agent_id = NULL
 WHERE agent_id IS NOT NULL;

ALTER TABLE entity_reactions ADD CONSTRAINT entity_reactions_one_target
    CHECK (num_nonnulls(group_share_id, group_comment_id, board_comment_id, agent_id,
                        agent_comment_id, template_comment_id, entity_comment_id, item_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_entity_comment
    ON entity_reactions (entity_comment_id, user_id, emoji) WHERE entity_comment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_reactions_item
    ON entity_reactions (item_type, item_id, user_id, emoji) WHERE item_id IS NOT NULL;

-- F0: the old tables and columns stay readable, nothing writes them anymore.
COMMENT ON TABLE agent_comments IS 'Deprecated 2026-10-20: copied into entity_comments (entity_type agent), no longer written.';
COMMENT ON TABLE template_comments IS 'Deprecated 2026-10-20: copied into entity_comments (entity_type template), no longer written.';
COMMENT ON COLUMN entity_reactions.agent_id IS 'Deprecated 2026-10-20: moved to item_type/item_id, no longer written.';
COMMENT ON COLUMN entity_reactions.agent_comment_id IS 'Deprecated 2026-10-20: moved to entity_comment_id, no longer written.';
COMMENT ON COLUMN entity_reactions.template_comment_id IS 'Deprecated 2026-10-20: moved to entity_comment_id, no longer written.';
