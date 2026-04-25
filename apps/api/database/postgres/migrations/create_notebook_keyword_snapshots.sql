-- Monthly NLP-extracted keyword snapshots per notebook (system collection).
-- Refreshed by a scheduled job on the 1st of each month (cron).
-- Stats endpoint reads the latest row to render the "Häufigste Begriffe" word cloud
-- without making an inline NLP call.

CREATE TABLE IF NOT EXISTS notebook_keyword_snapshots (
  collection_id TEXT NOT NULL,
  month TEXT NOT NULL,                       -- 'YYYY-MM'
  keywords JSONB NOT NULL DEFAULT '[]',      -- [{keyword, count, topic|null}]
  total_documents INT NOT NULL DEFAULT 0,
  sample_size INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, month)
);

CREATE INDEX IF NOT EXISTS idx_notebook_keyword_snapshots_month
  ON notebook_keyword_snapshots(month DESC);

CREATE INDEX IF NOT EXISTS idx_notebook_keyword_snapshots_collection_month
  ON notebook_keyword_snapshots(collection_id, month DESC);
