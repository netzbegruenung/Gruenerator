-- Asynchronous Grünerator board agent: bot identity + durable task queue.
--
-- A user delegates work by writing a comment "@gruenerator <task>" on a board
-- card. The comment-mention path enqueues a row here; the boardAgentWorker
-- poller drains it (FOR UPDATE SKIP LOCKED → cluster-safe), runs the ChatGraph,
-- writes a document and notifies the requester.
--
-- The bot is a sentinel profiles row so it can appear in the @-mention list and
-- author its own reply comments. Its id matches GRUENERATOR_BOT_USER_ID in
-- apps/api/services/boards/grueneratorBot.ts. All other profile columns rely on
-- their schema defaults.

INSERT INTO profiles (id, display_name, first_name, username, avatar_robot_id)
VALUES ('00000000-0000-0000-0000-000000000010', 'Grünerator', 'Grünerator', 'gruenerator', 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL,
  card_id TEXT NOT NULL,
  trigger_comment_id UUID,
  requested_by UUID NOT NULL,
  task_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  result_document_id UUID,
  error TEXT,
  locale TEXT NOT NULL DEFAULT 'de-DE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- The poller claims the oldest claimable task; this index serves the
-- WHERE status / ORDER BY created_at scan.
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_created ON agent_tasks (status, created_at);
