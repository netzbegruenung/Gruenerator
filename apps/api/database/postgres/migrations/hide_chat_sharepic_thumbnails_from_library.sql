-- Derived sharepic thumbnails (upload_source = 'chat-sharepic-thumbnail') are
-- stored only to back a canvas's thumbnail_url — they must not surface as their
-- own card in the media library or the "Zuletzt" recent feed. Retroactively flag
-- existing rows non-library so the duplicate cards disappear.
-- (New rows are already inserted with is_library_item = FALSE, see uploadMediaFile.)
UPDATE shared_media
SET is_library_item = FALSE
WHERE upload_source = 'chat-sharepic-thumbnail'
  AND is_library_item IS DISTINCT FROM FALSE;
