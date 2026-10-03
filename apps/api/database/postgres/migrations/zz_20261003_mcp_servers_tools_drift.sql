-- Tool-definition drift waiting for the user's approval.
--
-- The catalog compares a user-connected server's live tool definitions against
-- tool_fingerprints on every load. Until now a mismatch only produced a chat
-- message that sent the user to the settings — where nothing showed it and no
-- control could approve it. This column carries what the settings need:
-- `{ changed: string[], added: string[], detectedAt: string }` with raw tool
-- names. NULL = nothing pending; approving clears it with the baseline.

ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS tools_drift JSONB;

COMMENT ON COLUMN mcp_servers.tools_drift IS
  'Pending tool-definition drift {changed, added, detectedAt}; NULL = nothing pending.';
