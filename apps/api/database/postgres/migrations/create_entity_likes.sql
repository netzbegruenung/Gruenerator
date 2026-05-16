CREATE TABLE IF NOT EXISTS entity_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_likes_user_entity_unique UNIQUE (user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_likes_entity ON entity_likes (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_likes_user_type ON entity_likes (user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_likes_popularity ON entity_likes (entity_type, entity_id, created_at);

DROP TABLE IF EXISTS template_likes;
