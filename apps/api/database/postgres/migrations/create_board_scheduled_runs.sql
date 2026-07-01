-- Scheduled / recurring KI-Spalte runs.
--
-- A board AI column (KI-Spalte) can be put on a schedule ("every Monday 09:00")
-- so it fires without a human clicking "Grünerator-Agent starten". Each schedule
-- stores the same resolved flow config a manual run uses (source + AI step +
-- output nodes + card context) plus an RRULE and the next fire time.
--
-- The boardScheduleWorker poller claims due schedules (FOR UPDATE SKIP LOCKED →
-- cluster-safe), enqueues an agent_tasks row via the existing pipeline, then
-- advances next_run_at from the RRULE. No second executor: scheduling is purely
-- an upstream trigger on the existing enqueueAgentTask → runFlow path.

CREATE TABLE IF NOT EXISTS board_scheduled_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL,
  card_id TEXT NOT NULL,
  created_by UUID NOT NULL,
  locale TEXT NOT NULL DEFAULT 'de-DE',
  -- Resolved flow config (BoardFlowConfig): source + AI step + output nodes +
  -- card context. Same shape stored on agent_tasks.flow_config.
  flow_config JSONB NOT NULL,
  -- iCalendar RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0".
  rrule TEXT NOT NULL,
  -- IANA timezone the RRULE is interpreted in, e.g. "Europe/Vienna".
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  require_review BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The poller scans enabled schedules whose next_run_at has passed.
CREATE INDEX IF NOT EXISTS idx_board_scheduled_runs_due
  ON board_scheduled_runs (enabled, next_run_at);

-- List a board's schedules in the UI.
CREATE INDEX IF NOT EXISTS idx_board_scheduled_runs_board
  ON board_scheduled_runs (board_id);

-- Attribute each queued run back to the schedule that spawned it (feeds run
-- history). Null for manual / @-mention tasks.
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS schedule_id UUID;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_schedule
  ON agent_tasks (schedule_id, created_at);

-- Review loop (Phase 2): when set, a finished run parks in status
-- 'awaiting_review' for a human to Accept or Redo instead of completing silently.
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS require_review BOOLEAN NOT NULL DEFAULT FALSE;
