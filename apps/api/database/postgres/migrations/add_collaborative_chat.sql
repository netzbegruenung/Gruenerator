-- Add collaborative chat support
-- Enables thread sharing (group + individual) and message attribution

-- Message attribution: who sent each message
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);

-- Thread sharing: mirrors collaborative_documents pattern
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Index for permission lookups (GIN on JSONB for ? operator)
CREATE INDEX IF NOT EXISTS idx_chat_threads_permissions ON chat_threads USING gin (permissions);
