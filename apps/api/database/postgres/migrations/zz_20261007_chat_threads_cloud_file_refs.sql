-- Cloud files (@wolke / @connect) picked in a thread stay in that thread (#4112).
-- Refs only ({wolke: [...], connect: [...]}) — the file is re-read every turn,
-- its contents are never stored here.
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS cloud_file_refs JSONB;
