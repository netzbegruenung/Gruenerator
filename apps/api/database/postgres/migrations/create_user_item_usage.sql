-- Per-user usage tracking for automatic "favourites first" ordering.
-- One generic table covers all four populations (system + user notebooks,
-- system + user agents) since item ids are heterogeneous strings (UUIDs for
-- user collections, slugs for system notebooks/agents). Mirrors the
-- user_recent_values upsert-on-use pattern. Sorting reads this aggregate.

CREATE TABLE IF NOT EXISTS user_item_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_item_usage_unique UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_item_usage_user_type
  ON user_item_usage (user_id, item_type);
