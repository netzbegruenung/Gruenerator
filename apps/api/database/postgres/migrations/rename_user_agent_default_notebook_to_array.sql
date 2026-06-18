-- Let an agent bind MULTIPLE notebooks as its combined default knowledge base.
-- Replaces the single `default_notebook_id` TEXT with `default_notebook_ids`
-- JSONB (a string[] of system notebook slugs and/or user notebook UUIDs,
-- resolved per-shape at chat time). Backfill wraps the existing single value
-- into a one-element array. Idempotent so a re-run is a no-op.
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS default_notebook_ids JSONB;

UPDATE user_agents
  SET default_notebook_ids = to_jsonb(ARRAY[default_notebook_id])
  WHERE default_notebook_id IS NOT NULL
    AND default_notebook_ids IS NULL;

ALTER TABLE user_agents DROP COLUMN IF EXISTS default_notebook_id;
