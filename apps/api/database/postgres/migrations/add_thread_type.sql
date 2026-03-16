-- Add thread_type column to chat_threads for distinguishing search vs chat threads
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS thread_type VARCHAR(20) DEFAULT 'chat';

-- Index for filtering by thread type
CREATE INDEX IF NOT EXISTS idx_chat_threads_type ON chat_threads(user_id, thread_type, updated_at DESC);
