-- Index for the feedback endpoint's ownership check.
--
-- POST /api/chat-service/feedback used to forward any traceId string straight
-- into the Langfuse scores API. It now verifies that the id belongs to one of
-- the caller's own turns, which means looking up chat_messages by the traceId
-- persisted in tool_results. Without this index that lookup is a sequential
-- scan over every chat message ever written, on a path a user hits per thumbs
-- click.
--
-- Partial on purpose: only traced assistant turns carry the key at all, and
-- tracing is env-gated, so the index stays a small fraction of the table.

CREATE INDEX IF NOT EXISTS idx_chat_messages_trace_id
  ON chat_messages ((tool_results ->> 'traceId'))
  WHERE tool_results ->> 'traceId' IS NOT NULL;
