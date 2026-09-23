-- Kopfdaten-Worker (services/documentMeta): welche Dokumente er von sich aus liest.
--
-- Bestehende Zeilen bekommen FALSE, jede danach angelegte TRUE. Damit liest der
-- Worker neue Uploads sofort und den Bestand erst, wenn DOCUMENT_META_BACKFILL
-- nach einem Trockenlauf eingeschaltet ist. Die Grenze ist der Moment dieser
-- Migration, nicht ein Datum im Code, das beim Deploy schon falsch sein kann.
--
-- ADD COLUMN mit konstantem Default schreibt keine Zeile um und löst den
-- updated_at-Trigger nicht aus.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_meta_auto BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE documents ALTER COLUMN doc_meta_auto SET DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_documents_doc_meta_pending
  ON documents (created_at)
  WHERE status = 'completed' AND doc_meta_auto AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'doc_meta');
