-- Per-user opt-out for MANAGED MCP connectors (EXPERIMENTAL).
-- Managed connectors are first-party servers configured from env, offered to
-- every user without an mcp_servers row. The only per-user fact is "switched
-- off", so a missing row IS the default (enabled). No backfill, now or later.
-- Runtime connects as `gruenerator`, so the table must be owned by that role.

CREATE TABLE IF NOT EXISTS mcp_system_prefs (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  system_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, system_key)
);

ALTER TABLE mcp_system_prefs OWNER TO gruenerator;
