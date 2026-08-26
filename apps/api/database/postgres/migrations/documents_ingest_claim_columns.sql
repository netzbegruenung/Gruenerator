-- Claim bookkeeping for the document ingest worker.
--
-- Ingestion used to be a fire-and-forget promise: a deploy mid-run left the row
-- on 'processing' with nobody working on it, and no boot scan ever looked for
-- those. These two columns let the worker claim rows with FOR UPDATE SKIP
-- LOCKED (cluster-safe, same pattern as agent_tasks / board_schedules) and
-- reclaim ones whose owner died, while the attempt counter stops a document
-- that crashes the pipeline from looping forever.
--
-- Additive with defaults: NULL processing_started_at simply means "never
-- claimed", so existing rows need no backfill.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0;

-- The claim query scans only for pending/in-flight rows. A partial index keeps
-- that lookup off the (much larger) set of completed documents.
CREATE INDEX IF NOT EXISTS idx_documents_ingest_pending
  ON documents (created_at)
  WHERE status IN ('uploaded', 'processing');
