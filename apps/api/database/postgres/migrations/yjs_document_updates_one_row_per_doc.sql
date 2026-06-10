-- One row per document in yjs_document_updates.
--
-- The hocuspocus store path writes the FULL document state (not an
-- incremental delta) on every store tick, so historical rows are redundant
-- copies of each other: dozens of full gzipped documents accumulate between
-- snapshots and every connection load has to gunzip and apply all of them.
-- Keep only the newest row per document and enforce uniqueness so writers
-- can UPSERT the current state.

DELETE FROM yjs_document_updates u
USING (
  SELECT DISTINCT ON (document_id) document_id, id
  FROM yjs_document_updates
  ORDER BY document_id, created_at DESC NULLS LAST, id DESC
) keep
WHERE u.document_id = keep.document_id
  AND u.id <> keep.id;

DROP INDEX IF EXISTS idx_yjs_document_updates_document_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_yjs_document_updates_document_id
  ON yjs_document_updates(document_id);
