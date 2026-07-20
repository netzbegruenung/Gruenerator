-- Spaces: a chat thread's home "Space" (a group). Threads can be filed into a
-- personal (group_type='personal') or team (group_type='standard') space. NULL =
-- unfiled. Mirrors documents.group_id. A thread can additionally be shared to
-- more spaces via group_content_shares (content_type='chat_threads'), unchanged.
-- No BEGIN/COMMIT — the migration runner wraps this file in a transaction.

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS group_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_chat_threads_group'
    ) THEN
        ALTER TABLE chat_threads
            ADD CONSTRAINT fk_chat_threads_group
            FOREIGN KEY (group_id) REFERENCES groups(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_threads_group_id
    ON chat_threads(group_id) WHERE group_id IS NOT NULL;
