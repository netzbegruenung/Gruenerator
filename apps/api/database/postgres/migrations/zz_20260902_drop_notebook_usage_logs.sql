-- `notebook_usage_logs` is never written by the streaming notebook chat (the
-- surface nearly all notebook questions go through) and has no reader
-- anywhere in the codebase (#3127). Usage is now tracked via Langfuse traces
-- instead, now that the notebook completion carries a traceId (#3129).
--
-- No BEGIN/COMMIT: the migration runner wraps each file in a transaction.
DROP TABLE IF EXISTS notebook_usage_logs;
