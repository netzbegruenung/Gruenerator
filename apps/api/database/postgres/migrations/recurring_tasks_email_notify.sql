-- Per-task email notification toggle for recurring tasks. Default true preserves
-- the prior behavior (agent_task_completed emailed per the user's global prefs).
-- Named to sort after create_recurring_tasks.sql (migrations run alphabetically).
ALTER TABLE recurring_tasks
  ADD COLUMN IF NOT EXISTS email_notify boolean NOT NULL DEFAULT true;
