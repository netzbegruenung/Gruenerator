-- Board "AI columns" (KI-Spalten) store their resolved flow config (source + AI
-- step + output nodes + card context) on the agent task. Null = legacy @-mention
-- task, which keeps the existing comment/document auto-classification path.
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS flow_config JSONB;
