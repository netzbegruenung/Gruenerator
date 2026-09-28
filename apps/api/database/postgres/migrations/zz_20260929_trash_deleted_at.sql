-- Papierkorb: jede Nutzer-Inhaltstabelle bekommt `deleted_at`. Löschen setzt die
-- Spalte, Wiederherstellen leert sie, erst der Purge nach 30 Tagen entfernt die
-- Zeile. Der partielle Index trägt Papierkorb-Liste und Purge-Lauf; die
-- Live-Leser filtern `deleted_at IS NULL` und brauchen ihn nicht.

ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_collaborative_documents_trashed ON collaborative_documents (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_chat_threads_trashed ON chat_threads (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_documents_trashed ON documents (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_shared_media_trashed ON shared_media (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE subtitler_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_subtitler_projects_trashed ON subtitler_projects (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_agents_trashed ON user_agents (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE user_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_templates_trashed ON user_templates (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE user_text_forms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_text_forms_trashed ON user_text_forms (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE custom_prompts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_custom_prompts_trashed ON custom_prompts (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE user_sites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_sites_trashed ON user_sites (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_trashed ON recurring_tasks (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE user_letterheads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_letterheads_trashed ON user_letterheads (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_documents_trashed ON user_documents (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE user_knowledge ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_user_knowledge_trashed ON user_knowledge (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_groups_trashed ON groups (deleted_at) WHERE deleted_at IS NOT NULL;

-- Alt-Löschungen aus der Zeit vor dem Papierkorb erscheinen 30 Tage lang darin
-- und werden danach bereinigt. Bewusst `now()` und nicht `now() - 30 days`:
-- sonst wäre der erste Lauf des neuen Purge-Codes zugleich sein größter.
UPDATE collaborative_documents SET deleted_at = now() WHERE is_deleted = true AND deleted_at IS NULL;

-- `is_deleted` bleibt (Hocuspocus und viele Leser prüfen es), muss aber mit
-- `deleted_at` übereinstimmen. Beide Spalten schreibt nur
-- `trashCollaborativeDocument`/`restoreCollaborativeDocument`; ein Schreiber,
-- der nur `is_deleted = true` setzt, scheitert hier laut mit 23514.
ALTER TABLE collaborative_documents DROP CONSTRAINT IF EXISTS collaborative_documents_trash_pair;
ALTER TABLE collaborative_documents ADD CONSTRAINT collaborative_documents_trash_pair
    CHECK (COALESCE(is_deleted, false) = (deleted_at IS NOT NULL));
