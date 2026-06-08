CREATE TABLE IF NOT EXISTS entity_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_favorites_user_entity_unique UNIQUE (user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_favorites_entity ON entity_favorites (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_favorites_user_type ON entity_favorites (user_id, entity_type);
