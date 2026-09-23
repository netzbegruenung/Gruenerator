-- Kopfdaten-Worker (services/documentMeta): die Grenze zwischen Bestand und neu.
--
-- Eine Zeile mit dem Zeitpunkt dieser Migration. Der Worker liest von sich aus
-- nur Dokumente mit `created_at >= since`; der Bestand braucht
-- DOCUMENT_META_BACKFILL nach einem Trockenlauf. Fehlt die Zeile oder die
-- Tabelle, claimt der Worker gar nichts (fail-closed).
--
-- Bewusst KEINE Spalte mit Default an `documents`: `syncSchemaColumns` ergänzt
-- fehlende Spalten aus schema.sql samt Default — liefe es vor dieser Migration
-- (Cluster-Rennen um das Advisory-Lock, zurückgerollte Migration), bekäme der
-- ganze Bestand den Wert für „neu". Deshalb steht diese Tabelle auch nicht in
-- schema.sql.

CREATE TABLE IF NOT EXISTS document_meta_boundary (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  since TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO document_meta_boundary (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Der Neu-Zweig des Claims sucht fertige Dokumente ohne doc_meta. Ein Index,
-- keine Spalte: er ändert an keiner Zeile etwas und trägt keinen Default.
CREATE INDEX IF NOT EXISTS idx_documents_doc_meta_pending
  ON documents (created_at)
  WHERE status = 'completed' AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'doc_meta');
