-- Connectors from the directory whose server we know become ordinary rows.
--
-- Until 11/2026 the managed connectors (Bahn, Wetter, tagesschau, trivago,
-- Gesetze, Rateo) had no mcp_servers row: a synthetic `system-<key>` id plus a
-- per-user switch in mcp_system_prefs. Now "connect" inserts a row carrying the
-- connector's key. URL and token still come from deploy env (never stored
-- here), which is why such a row has url = '' and auth_type = 'none'; its
-- display name comes from the code definition, not from `name`.
--
-- One row per person and key: the partial unique index makes connecting
-- idempotent and lets this backfill run twice without duplicates.
--
-- mcp_system_prefs is no longer read after this migration. It stays (F0);
-- drop no earlier than 2027-05.

ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS registry_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mcp_servers_user_registry_key
  ON mcp_servers (user_id, registry_key) WHERE registry_key IS NOT NULL;

INSERT INTO mcp_servers (user_id, name, url, auth_type, registry_key, enabled)
SELECT user_id, system_key, '', 'none', system_key, TRUE
FROM mcp_system_prefs
WHERE enabled = TRUE
ON CONFLICT (user_id, registry_key) WHERE registry_key IS NOT NULL DO NOTHING;

COMMENT ON COLUMN mcp_servers.registry_key IS
  'Key of a known connector (services/mcp/connectorAdapters.ts); URL/token from env. NULL = a user-added server.';
