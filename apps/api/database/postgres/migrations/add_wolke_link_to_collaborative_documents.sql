-- Link collaborative documents to a Wolke (Nextcloud) target so we can keep them in sync
-- after the first "In Wolke speichern" click. Without this, the upload is one-shot.

ALTER TABLE collaborative_documents
  ADD COLUMN IF NOT EXISTS wolke_share_link_id TEXT,
  ADD COLUMN IF NOT EXISTS wolke_file_path TEXT,
  ADD COLUMN IF NOT EXISTS wolke_etag TEXT,
  ADD COLUMN IF NOT EXISTS wolke_live_sync BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_collab_docs_wolke_live_sync
  ON collaborative_documents (wolke_live_sync)
  WHERE wolke_live_sync = true;
