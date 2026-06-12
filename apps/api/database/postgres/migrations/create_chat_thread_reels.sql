-- Maps chat threads to the subtitler projects ("reels") edited in them.
-- Written on the first successful chat subtitle edit of a project (or when a
-- chat-uploaded video finishes auto-processing); `is_active` marks the
-- project the chat's reel_edit branch targets when the request carries no
-- explicit currentReel selection.

CREATE TABLE IF NOT EXISTS chat_thread_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES subtitler_projects(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_thread_reels_unique UNIQUE (thread_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_reels_thread
  ON chat_thread_reels (thread_id);
