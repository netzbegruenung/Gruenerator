-- Site block model: `sections` becomes { header?, profileImageFocus?, blocks: [...] } and the
-- site draft Y.Doc moves to schema version 2. No site is live yet, so rows and drafts are
-- reset rather than converted: a row with empty sections opens as the standard page, and its
-- draft room is seeded afresh from the row on the next visit.
--
-- A published snapshot of the old shape would no longer parse, so it goes too, and the row is
-- no longer published. last_published stays: it locks the address after the first publish.
UPDATE user_sites SET sections = '{}'::jsonb, published_snapshot = NULL, is_published = false;

-- Site draft rooms store their Yjs rows under the bare site id (services/hocuspocus siteRooms).
DELETE FROM yjs_document_updates WHERE document_id IN (SELECT id FROM user_sites);
DELETE FROM yjs_document_snapshots WHERE document_id IN (SELECT id FROM user_sites);
