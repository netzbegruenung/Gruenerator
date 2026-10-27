-- @doc, saved-text and @link picks stay in the thread they were picked in (#4861).
-- Refs only ({texts: uuid[], docs: uuid[], links: url[]}) — every turn reads them
-- again through its own access check, no content is stored here.
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS mention_refs JSONB;
