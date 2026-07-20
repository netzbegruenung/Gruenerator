-- Chat thread folders: OpenWebUI-style folders that group chat threads into
-- workspaces. Grouping + search-scope only — instructions/knowledge live on the
-- Grünerator (user_agents), not here. Clones the proven
-- collaborative_document_folders / collaborative_documents.folder_id pattern.
-- No BEGIN/COMMIT — the migration runner wraps this file in a transaction
-- (see PostgresService.init()).

CREATE TABLE IF NOT EXISTS chat_thread_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES chat_thread_folders(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_folders_user_id ON chat_thread_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_thread_folders_parent ON chat_thread_folders(parent_id);

-- Link threads → folder. ON DELETE SET NULL so deleting a folder orphans its
-- threads (they leave the folder) instead of cascading away chat history.
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS folder_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_chat_threads_folder'
    ) THEN
        ALTER TABLE chat_threads
            ADD CONSTRAINT fk_chat_threads_folder
            FOREIGN KEY (folder_id) REFERENCES chat_thread_folders(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_threads_folder_id
    ON chat_threads(folder_id) WHERE folder_id IS NOT NULL;
