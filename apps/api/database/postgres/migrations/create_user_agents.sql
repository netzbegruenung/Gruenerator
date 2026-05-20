-- User-created agents (Phase 2 of agent unification).
-- System agents come from packages/shared/src/agents/system.ts; this table
-- holds per-user customisations merged into the registry at lookup time.

CREATE TABLE IF NOT EXISTS user_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  identifier TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  system_role TEXT NOT NULL,
  avatar TEXT NOT NULL,
  background_color TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT NOT NULL,
  default_model TEXT,
  provider TEXT NOT NULL,
  params JSONB NOT NULL,
  opening_message TEXT NOT NULL,
  opening_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  locale TEXT NOT NULL DEFAULT 'de-DE',
  author TEXT NOT NULL,
  plugins JSONB,
  enabled_tools JSONB,
  few_shot_examples JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_agents_user_identifier_unique UNIQUE (user_id, identifier)
);

CREATE INDEX IF NOT EXISTS idx_user_agents_user_id ON user_agents (user_id);
