-- API keys for external programmatic access (MCP / partner integrations).
-- Stores SHA-256 hash of plaintext key — never the key itself.
-- LV scope is metadata enforced at the middleware level (intersect with request).

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '{}'::jsonb,
  rate_limit_per_minute INTEGER,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS api_keys_active_idx
  ON api_keys(revoked_at, expires_at) WHERE revoked_at IS NULL;

-- Note: notebook usage logging (a Qdrant collection plus a mirror Postgres
-- table, both named `notebook_usage_logs`) was removed entirely — it was
-- never written by the streaming notebook chat and had no reader (#3127).
