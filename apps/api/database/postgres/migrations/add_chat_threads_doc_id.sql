-- Link a chat_threads row to a collaborative_documents row so the docs editor
-- can resolve "which thread belongs to this doc?" deterministically. One thread
-- per doc, shared across users via the existing permissions JSONB. NULL for
-- regular (non-doc) threads, hence the partial unique index.

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS doc_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_threads_doc_id
  ON chat_threads(doc_id)
  WHERE doc_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_threads_doc_id
  ON chat_threads(doc_id)
  WHERE doc_id IS NOT NULL;
