-- Let user-created agents bind a notebook and surface skill quick-starts.
--   default_notebook_id: a system notebook slug (e.g. 'hamburg-notebook') OR a
--     user notebook UUID. Resolved per-shape at chat time (slugs via the
--     collection map; UUIDs via resolveUserNotebookDocumentIds).
--   skill_mentions: array of system skill `mention` strings (e.g. 'presse')
--     rendered as clickable quick-starts on the agent's chat landing.
-- Additive to create_user_agents.sql; idempotent so a re-run is a no-op.
ALTER TABLE user_agents
  ADD COLUMN IF NOT EXISTS default_notebook_id TEXT,
  ADD COLUMN IF NOT EXISTS skill_mentions JSONB;
