-- Persist the raw bytes of tabular attachments (CSV/Excel/ODS) so the in-browser
-- pandas interpreter can be rehydrated after a thread reload or on another
-- device. Only tabular files are stored here (base64) — documents/images keep
-- using extracted_text/summary. Nullable: non-tabular rows leave it empty.
--
-- document_id: set when a large prose document (PDF/Word/…) was chunked+embedded
-- into the Qdrant `documents` collection, so follow-up turns retrieve it via RAG
-- (executeMultiDocFanout) instead of re-injecting its truncated full text.
--
-- No BEGIN/COMMIT — the migration runner wraps each file in a transaction.
ALTER TABLE chat_thread_attachments
  ADD COLUMN IF NOT EXISTS file_data TEXT,
  ADD COLUMN IF NOT EXISTS document_id UUID;
