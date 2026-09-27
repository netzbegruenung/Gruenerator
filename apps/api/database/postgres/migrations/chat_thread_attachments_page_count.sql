-- Page count of an uploaded document, taken from the OCR extraction result
-- (previously discarded). Display-only metadata: the chat UI shows
-- "1,2 MB · 14 Seiten" on attachment chips, also after a thread reload.
-- NULL for images and for documents processed before this column existed.

ALTER TABLE chat_thread_attachments ADD COLUMN IF NOT EXISTS page_count INTEGER;
