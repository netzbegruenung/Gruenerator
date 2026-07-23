-- User-selectable default start page: which Workplace surface the sidebar "start"
-- icon (and the root/login redirect) opens.
--   'chat'     → /workplace           (Chat tab)
--   'arbeiten' → /workplace/arbeiten  (Arbeiten tab)
-- Defaults to 'chat', matching the previous Workplace default tab.
-- Targets the profiles table, which is created by schema.sql, so ordering
-- against other migrations is irrelevant.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_startpage TEXT NOT NULL DEFAULT 'chat'
  CHECK (default_startpage IN ('chat', 'arbeiten'));
