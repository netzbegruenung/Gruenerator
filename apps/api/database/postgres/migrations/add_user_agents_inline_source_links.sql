-- Migration: add inline_source_links to user_agents
-- When true, source URLs of search hits are injected into the model context so
-- the agent writes concrete article links inline (e.g. ready-to-send emails).
-- Nullable boolean: NULL/false = off (default), matching the optional field on
-- the canonical Agent type. Idempotent.

ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS inline_source_links BOOLEAN;
