-- Add 'draft' to shared_media status CHECK constraint
-- This allows auto-save to create draft entries that are promoted to 'ready' on explicit share

ALTER TABLE shared_media DROP CONSTRAINT IF EXISTS shared_media_status_check;
ALTER TABLE shared_media ADD CONSTRAINT shared_media_status_check
  CHECK (status IN ('processing', 'ready', 'failed', 'draft'));
