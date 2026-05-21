-- Wolke folder watcher: files detected in an auto_sync notebook's Wolke folders
-- that are not yet imported, awaiting the user's "Hinzufügen" click.
-- The unique (collection_id, file_path) index makes hourly detection idempotent.
-- No BEGIN/COMMIT — the migration runner wraps each file in its own transaction.

CREATE TABLE IF NOT EXISTS wolke_pending_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  user_id       UUID NOT NULL,
  share_link_id TEXT NOT NULL,
  folder_path   TEXT NOT NULL DEFAULT '',
  file_path     TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  etag          TEXT,
  size          BIGINT,
  mime_type     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wolke_pending_collection_file
  ON wolke_pending_files (collection_id, file_path);
CREATE INDEX IF NOT EXISTS idx_wolke_pending_collection_status
  ON wolke_pending_files (collection_id, status);
CREATE INDEX IF NOT EXISTS idx_wolke_pending_user_status
  ON wolke_pending_files (user_id, status);
