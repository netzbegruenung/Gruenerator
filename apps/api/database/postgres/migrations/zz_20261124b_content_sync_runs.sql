-- Lauf-Historie des Content-Syncs fürs Admin-Panel (statt Mail je Lauf).
--
-- Eine Zeile pro Quellen- bzw. LV-Lauf, geschrieben am Ende von
-- executeSyncRun (routes/internal/contentSyncContractRouter.ts) — der einen
-- Stelle, durch die jeder Lauf geht, Erfolg wie Fehler. Ältere Zeilen als
-- 90 Tage räumt der Schreiber selbst ab.
CREATE TABLE IF NOT EXISTS content_sync_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id TEXT NOT NULL,
  landesverband TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  recent BOOLEAN NOT NULL DEFAULT false,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  stored INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  dead_links INTEGER NOT NULL DEFAULT 0,
  -- Bei status='failed': die Meldung, mit der der Lauf abbrach.
  failure_message TEXT,
  error_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  dead_link_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  run_url TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_sync_runs_started_at
  ON content_sync_runs (started_at DESC);

-- Eine Zeile, id fest auf 1. Mails sind standardmäßig aus.
CREATE TABLE IF NOT EXISTS content_sync_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

INSERT INTO content_sync_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
