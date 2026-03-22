-- Add 'transfer' media type for file sharing via Wolke
-- Widen media_type CHECK constraint
ALTER TABLE shared_media DROP CONSTRAINT IF EXISTS shared_media_media_type_check;
ALTER TABLE shared_media ADD CONSTRAINT shared_media_media_type_check
  CHECK (media_type IN ('video', 'image', 'transfer'));

-- Wolke reference columns for transfer items
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS wolke_share_link_id TEXT;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS wolke_file_path TEXT;
