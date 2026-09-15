-- Grünerator Voice stores generated speech in the Mediathek: one shared_media
-- row per output format (mp3, telephone WAV). Widen the media_type CHECK.
ALTER TABLE shared_media DROP CONSTRAINT IF EXISTS shared_media_media_type_check;
ALTER TABLE shared_media ADD CONSTRAINT shared_media_media_type_check
  CHECK (media_type IN ('video', 'image', 'transfer', 'audio'));
