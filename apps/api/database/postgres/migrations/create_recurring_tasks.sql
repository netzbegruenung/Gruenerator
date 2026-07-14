-- EXPERIMENTAL — standalone recurring agent tasks ("Wiederkehrende Aufgabe").
--
-- Unlike board_scheduled_runs this is NOT board/card-scoped: a task references an
-- agent by identifier (own→group→system) and delivers its result to the user
-- directly (document / summary notification / new chat thread). The
-- recurringTaskWorker poller claims due rows (FOR UPDATE SKIP LOCKED → cluster-safe),
-- runs the agent, delivers, and advances next_run_at from the RRULE.
--
-- Supersedes the never-built briefing_agents stub (dropped in drop_briefing_agents.sql).

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  -- Agent to run (own / group-shared / system). TEXT slug, never a UUID.
  -- Null → the default universal agent.
  agent_identifier TEXT,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  -- Delivery target: 'document' | 'summary' | 'thread'.
  delivery TEXT NOT NULL DEFAULT 'document'
    CHECK (delivery IN ('document', 'summary', 'thread')),
  -- iCalendar RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0".
  rrule TEXT NOT NULL,
  -- IANA timezone the RRULE is interpreted in.
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  locale TEXT NOT NULL DEFAULT 'de-DE',
  -- Reserved for absorbed briefing features (sources[], timeRange, outputFormat).
  config JSONB,
  -- Empty-suppression: a run that finds nothing new increments this; output resets it.
  consecutive_empty_count INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The poller scans enabled tasks whose next_run_at has passed.
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_due
  ON recurring_tasks (enabled, next_run_at);

-- List a user's tasks in the UI.
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_user
  ON recurring_tasks (user_id);

-- updated_at is bumped explicitly by the repository on each UPDATE (matches the
-- user_agents pattern — no trigger dependency).

-- Per-execution history (absorbed from briefing_executions).
CREATE TABLE IF NOT EXISTS recurring_task_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('completed', 'empty', 'failed')),
  results_summary TEXT,
  result_url TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_task_runs_task
  ON recurring_task_runs (task_id, created_at DESC);
