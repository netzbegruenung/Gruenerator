-- Canvas gallery thumbnails and template previews are internal artifacts,
-- not user media. Newly uploaded ones now insert with is_library_item = FALSE;
-- backfill the rows created before that.
UPDATE shared_media
SET is_library_item = FALSE
WHERE upload_source IN (
  'chat-sharepic-thumbnail',
  'canvas-mint-thumbnail',
  'canvas-thumbnail',
  'gruenerator-vorlage'
);
