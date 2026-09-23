-- Eigene Migration, getrennt von der Grenze (zz_20260923_document_meta_boundary):
-- scheitert der Indexbau (Lock-Wartezeit, statement_timeout auf einer grossen
-- documents-Tabelle), rollt nur der Index zurück — die Grenzzeile bleibt, und
-- der Worker arbeitet ohne Index weiter.
-- Der Neu-Zweig des Claims sucht fertige Dokumente ohne doc_meta. Ein Index,
-- keine Spalte: er ändert an keiner Zeile etwas und trägt keinen Default.
CREATE INDEX IF NOT EXISTS idx_documents_doc_meta_pending
  ON documents (created_at)
  WHERE status = 'completed' AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'doc_meta');
