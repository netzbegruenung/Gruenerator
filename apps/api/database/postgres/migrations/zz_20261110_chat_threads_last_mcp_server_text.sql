-- The sticky MCP scope also holds MANAGED connector ids (`system-rateo`,
-- `system-wetter`, …), which are not UUIDs. As `uuid` the column rejected every
-- one of them (22P02), so a managed connector never stuck to its thread — and
-- the fire-and-forget write that hit the error took the API process down.
-- User server ids are UUIDs and survive the cast unchanged.
ALTER TABLE chat_threads
  ALTER COLUMN last_mcp_server_id TYPE text USING last_mcp_server_id::text;
