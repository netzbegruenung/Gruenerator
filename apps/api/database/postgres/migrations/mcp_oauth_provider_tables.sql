-- Better Auth `mcp` plugin tables: OAuth 2.1 authorization server backing the
-- authenticated MCP endpoint (/api/mcp-server, mcp.gruenerator.eu/v2).
-- Drizzle schema: database/schema/oauthProvider.ts (model names
-- oauthApplication / oauthAccessToken / oauthConsent).

CREATE TABLE IF NOT EXISTS ba_oauth_applications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  icon TEXT,
  metadata TEXT,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT,
  redirect_urls TEXT NOT NULL,
  type TEXT NOT NULL,
  disabled BOOLEAN DEFAULT FALSE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ba_oauth_applications_user ON ba_oauth_applications(user_id);

CREATE TABLE IF NOT EXISTS ba_oauth_access_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  access_token TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL UNIQUE,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  client_id TEXT NOT NULL REFERENCES ba_oauth_applications(client_id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ba_oauth_access_tokens_user ON ba_oauth_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_access_tokens_client ON ba_oauth_access_tokens(client_id);

CREATE TABLE IF NOT EXISTS ba_oauth_consents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  client_id TEXT NOT NULL REFERENCES ba_oauth_applications(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,
  consent_given BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ba_oauth_consents_user ON ba_oauth_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_consents_client ON ba_oauth_consents(client_id);
