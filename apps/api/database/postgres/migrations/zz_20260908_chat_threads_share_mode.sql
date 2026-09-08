-- Link sharing for chat threads: 'authenticated' grants READ access to any
-- logged-in user holding the /chat/geteilt/<slug> link (resolved via the
-- existing slug_suffix). Distinct from is_public, which grants full write
-- access in getThreadAccessLevel. Values: 'private' | 'authenticated'.
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS share_mode TEXT NOT NULL DEFAULT 'private';
