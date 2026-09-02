-- Explicit user memory replaces the passive mem0 extraction (#3075).
--
-- Before: mem0ai extracted "memories" from every 3rd turn through a gatekeeper
-- LLM and its own extraction LLM, stored them in Qdrant only, and the model had
-- no tool to write one on request — "merk dir, dass …" was throttled away and
-- confirmed anyway. After: the model saves what the person explicitly asks for
-- through the `memory` tool; this table is the source of truth and Qdrant
-- mirrors only the `fakt` rows for retrieval.
CREATE TABLE IF NOT EXISTS user_memories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('anweisung', 'fakt')),
  text       TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 400),
  source     TEXT NOT NULL CHECK (source IN ('chat', 'manual')),
  thread_id  UUID REFERENCES chat_threads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_memories_user ON user_memories(user_id, updated_at DESC);

-- The mem0 audit log had no reader outside the mem0 service itself, and the
-- extracted memories it described are discarded with the extraction pipeline
-- (decision 2026-09-01: no migration of the beta users' auto-extracted facts).
DROP TABLE IF EXISTS mem0_memory_history;

-- Memory is on for everyone now. Explicit memory only stores what the person
-- says out loud, so it no longer needs a beta opt-in. There was never a
-- user-facing switch, so flipping existing rows overwrites no one's choice;
-- the settings tab gets the switch in the same release.
ALTER TABLE profiles ALTER COLUMN memory_enabled SET DEFAULT true;
UPDATE profiles SET memory_enabled = true WHERE memory_enabled = false;
