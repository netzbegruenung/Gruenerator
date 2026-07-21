-- Thread-level memory of the tool family the last substantive turn used
-- ({kind, ref?, label?}). Generalises last_mcp_server_id: @mentions are
-- stripped from message text on send, so vague follow-ups need a server-side
-- carrier for "which tool were we working with".
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS last_tool_context JSONB;
