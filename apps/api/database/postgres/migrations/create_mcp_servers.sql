-- Per-user external MCP server registry (EXPERIMENTAL).
-- Tokens are encrypted at rest by the application (McpServerRegistry); the DB
-- stores only ciphertext. Runtime connects as `gruenerator`, so the table must
-- be owned by that role for future ALTERs to succeed.

CREATE TABLE IF NOT EXISTS mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none',
  token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  oauth_meta JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mcp_servers_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_user_id ON mcp_servers (user_id);

ALTER TABLE mcp_servers OWNER TO gruenerator;
