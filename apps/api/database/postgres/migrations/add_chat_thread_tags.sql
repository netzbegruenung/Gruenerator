-- Chat thread tags: auto-generated + user-editable topic tags for sidebar
-- filtering and tag-scoped chat search. Mirrors chatThreads.tags in
-- database/schema/chat.ts. No BEGIN/COMMIT — the migration runner wraps this
-- file in a transaction (see PostgresService.init()).

ALTER TABLE chat_threads
    ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]';

-- GIN index enables efficient containment queries (tags @> '["klima"]').
CREATE INDEX IF NOT EXISTS idx_chat_threads_tags ON chat_threads USING GIN (tags);
