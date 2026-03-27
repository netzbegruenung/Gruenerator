-- Add custom chat settings to chat_threads
-- custom_system_prompt: when set, replaces the entire system prompt for this thread
-- custom_enabled_tools: when set, overrides tool toggles for this thread

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS custom_system_prompt TEXT DEFAULT NULL;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS custom_enabled_tools JSONB DEFAULT NULL;
