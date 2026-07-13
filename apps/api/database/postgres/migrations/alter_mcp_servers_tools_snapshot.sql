-- Cached tool list per MCP server (EXPERIMENTAL).
-- Snapshot of {name, description}[] from the last successful connect. Used only
-- for chat mention hints + classifier context; the tool loop always lists live,
-- so staleness is harmless.

ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS tools_snapshot JSONB;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS tools_snapshot_at TIMESTAMPTZ;
