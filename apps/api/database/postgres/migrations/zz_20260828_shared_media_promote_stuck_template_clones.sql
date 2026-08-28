-- #3009: cloneTemplate inserted status='processing' on a path with no render
-- behind it, and nothing ever promoted the row. The canvas autosave then took
-- the update branch (updateImageShare writes file_path but never status), so a
-- template clone the user edited and saved holds a finished sharepic in a status
-- that hides it from the Mediathek, the recent-activity strip, /api/content and
-- chat media -- and makes its /preview answer HTTP 202, so even the /studio/gallery
-- tile that does list it renders without an image.
--
-- file_path IS NOT NULL is the whole predicate, and it is exact rather than
-- approximate. The only writers of 'processing' are createPendingVideoShare and
-- cloneTemplate. createPendingVideoShare inserts file_path as a literal NULL, and
-- finalizeVideoShare sets file_path and status='ready' in the SAME UPDATE -- so a
-- video share can never hold a file while still 'processing'. The only other
-- writer of file_path onto an existing row is updateImageShare, which is exactly
-- the clone-autosave case. Deliberately not narrowed to
-- original_template_id IS NOT NULL: a row stranded the same way by a future third
-- writer deserves the same rescue.
--
-- 'ready' rather than 'draft': these rows carry real bytes, real dimensions and a
-- title. 'draft' would put them in /studio/gallery but still not in the Mediathek,
-- which is ready-only by design (getMediaLibrary).
UPDATE shared_media
   SET status = 'ready'
 WHERE status = 'processing'
   AND file_path IS NOT NULL;

-- Same blast radius, second half: original_template_id was declared
-- REFERENCES shared_media(id) with no ON DELETE, i.e. NO ACTION. deleteShare
-- issues a bare DELETE, so deleting a share that other rows point at raises
-- 23503, which the service rethrows as a 500 -- an item the owner cannot remove
-- and gets no explanation for. Harmless while the clone flow could re-point
-- rows; permanent once it is retired, because nothing clears is_template any
-- more. SET NULL keeps the audit trail on every row that survives and lets the
-- delete through. IF EXISTS on both sides because schema.sql is executed only
-- by the manual initSchema(), so long-lived databases may never have had the
-- constraint at all.
ALTER TABLE shared_media DROP CONSTRAINT IF EXISTS shared_media_original_template_id_fkey;
ALTER TABLE shared_media ADD CONSTRAINT shared_media_original_template_id_fkey
    FOREIGN KEY (original_template_id) REFERENCES shared_media(id) ON DELETE SET NULL;
