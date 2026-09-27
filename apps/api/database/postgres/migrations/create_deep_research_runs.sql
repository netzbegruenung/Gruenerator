-- The record of which research runs exist, and which of them never finished.
--
-- The checkpointer (schema `langgraph`) stores the STATE of a run, keyed by
-- thread_id — but nothing that says whose run it was, what it was about, or
-- whether it ever produced a report. Without that, a checkpoint is unreadable:
-- there is no way to find the run that died in yesterday's deploy, and no way
-- to know when its state may be thrown away.
--
-- One row per run, written at the start and closed at the end. `status` is the
-- whole point: rows that stay `running` past a restart are exactly the
-- resumable ones.

CREATE TABLE IF NOT EXISTS deep_research_runs (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT,
  question TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'de-DE',
  -- running | finished | failed. Free text rather than an enum: the set is
  -- read by exactly one module, and an enum type would need its own migration
  -- to grow.
  status TEXT NOT NULL DEFAULT 'running',
  -- Set when the report became a real document, so a finished run links to it.
  document_id UUID,
  partial BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- The two questions asked of this table: "what is still open?" (resume) and
-- "what is old enough to delete?" (retention).
CREATE INDEX IF NOT EXISTS idx_deep_research_runs_status_started
  ON deep_research_runs(status, started_at);
CREATE INDEX IF NOT EXISTS idx_deep_research_runs_started
  ON deep_research_runs(started_at);
