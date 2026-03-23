-- Add notebook collection fields to chat_threads for notebook Q&A thread persistence
-- Notebook threads use thread_type = 'notebook' and link to a collection

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS notebook_collection_id VARCHAR(255);
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS notebook_collection_ids JSONB;

CREATE INDEX IF NOT EXISTS idx_chat_threads_notebook_collection
  ON chat_threads(notebook_collection_id) WHERE notebook_collection_id IS NOT NULL;

COMMENT ON COLUMN chat_threads.notebook_collection_id IS 'Primary notebook collection ID for thread_type=notebook threads';
COMMENT ON COLUMN chat_threads.notebook_collection_ids IS 'Array of collection IDs for multi-collection notebook threads';
