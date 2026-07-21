-- Sticky per-thread MCP scope: the last connected server the agentic loop was
-- scoped to, so an unscoped follow-up ("mach das nochmal") re-scopes to it
-- instead of fanning out over all connected servers. No FK — a deleted server
-- just yields no config and the loop safely falls back to the fan-out.
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS last_mcp_server_id uuid;
