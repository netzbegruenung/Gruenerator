-- Chat message lifecycle status: 'streaming' while an assistant turn is being
-- written, 'complete' once finalized. Mirrors chatMessages.status in
-- database/schema/chat.ts. A placeholder row is inserted as 'streaming' before
-- the LLM stream starts and flipped to 'complete' on finalize; a row still
-- 'streaming' after the request ended is read as an aborted turn (there is no
-- 'aborted' value — it is derived at read time). No BEGIN/COMMIT — the migration
-- runner wraps this file in a transaction (see PostgresService.init()).

ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'complete';
