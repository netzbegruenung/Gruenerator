-- Repair board rows whose `content` column was overwritten by the Hocuspocus
-- preview pipeline with BlockNote XHTML (e.g. "<blockgroup>...") instead of
-- JSON metadata. Pre-fix (see services/hocuspocus/src/persistence.ts), the
-- preview UPDATEs had no subtype filter, so any board ID that ever flowed
-- through the docs editor got its metadata clobbered. The frontend then
-- crashed in `parseContent` (apps/web/src/features/boards/types.ts) when
-- JSON.parse hit the HTML.
--
-- Only rows that are *definitively* malformed are touched: subtype is
-- 'boards', content is non-null, and content does not start with '{'.
-- Healthy rows (NULL content or valid JSON object) are left alone.
-- The repair value matches the default a fresh kanban board produces; we
-- can't recover the original board_type because the only source of truth
-- for that bit was the now-overwritten `content` column.

UPDATE collaborative_documents
SET content = '{"board_type":"kanban"}'
WHERE document_subtype = 'boards'
  AND content IS NOT NULL
  AND content NOT LIKE '{%';
