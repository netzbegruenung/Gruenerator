-- Article-level event log for the content sync ("Was ist passiert" Monitor tab).
-- Fed by POST /api/internal/monitor/sync-events from the content-sync GitHub
-- Action (CI has no Postgres access) and directly by in-process sync runs.
-- One row per article per day; retries and stored-then-updated-same-day fold
-- via the (source_url, event_date) upsert.

CREATE TABLE IF NOT EXISTS content_sync_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_group_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  landesverband TEXT,
  collection TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('stored', 'updated')),
  published_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ NOT NULL,
  -- Computed server-side at insert (UTC). Plain DATE so it can carry the
  -- unique index: timestamptz::date is not immutable.
  event_date DATE NOT NULL,
  sync_run_id TEXT,
  sync_run_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_sync_articles_url_day UNIQUE (source_url, event_date)
);

CREATE INDEX IF NOT EXISTS idx_csa_event_date ON content_sync_articles (event_date DESC);
CREATE INDEX IF NOT EXISTS idx_csa_source_group ON content_sync_articles (source_group_id);
CREATE INDEX IF NOT EXISTS idx_csa_landesverband ON content_sync_articles (landesverband);
