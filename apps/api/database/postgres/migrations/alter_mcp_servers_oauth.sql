-- OAuth support for user-managed MCP servers (EXPERIMENTAL).
-- Non-sensitive OIDC config (issuer, endpoints, clientId, scheme, scopes,
-- redirectUri, resource) lives in the existing `oauth_meta` jsonb. The client
-- secret is sensitive, so it gets its own encrypted column (like the tokens).

ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS oauth_client_secret_encrypted TEXT;
