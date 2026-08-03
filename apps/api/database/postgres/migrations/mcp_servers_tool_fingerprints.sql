-- Rug-pull detection for user-connected MCP servers.
--
-- We let users connect arbitrary external MCP servers. A server can change a
-- tool's DESCRIPTION after the user approved it, and a tool description is an
-- instruction the model obeys — so an unnoticed rewrite is a prompt-injection
-- vector with no user interaction at all.
--
-- tool_fingerprints stores `{ [toolName]: digest }`, exactly the shape the AI
-- SDK's fingerprintTools() returns. Every catalog load re-fingerprints the
-- live tool set and diffs it against this baseline.
--
-- Per server, not per tool: approval here is granted by connecting a server, so
-- a separate one-row-per-tool table would model a per-tool approval that does
-- not exist. The map is always read and written whole.
--
-- Deliberately nullable with no default. NULL means "never fingerprinted",
-- which the loader treats as "record the baseline now" rather than "blocked".
-- A default of '{}' would instead read as "approved zero tools" and would
-- therefore flag every tool on every already-connected server as `added` the
-- moment this deploys.
--
-- Named to sort after create_mcp_servers.sql so the ALTERs always land on an
-- existing table on a fresh database.

ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS tool_fingerprints JSONB;

ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS tools_approved_at TIMESTAMPTZ;

COMMENT ON COLUMN mcp_servers.tool_fingerprints IS
  'Approved tool-definition digests {toolName: digest}; NULL = not yet baselined.';
