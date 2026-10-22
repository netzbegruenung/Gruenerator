-- Notebook documents handed from the reader to the chat stay in that thread.
-- Refs only ([{documentId, notebookId} | {collectionId, sourceUrl}]) — access is
-- re-checked every turn, no document text is stored here.
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS notebook_source_refs JSONB;
