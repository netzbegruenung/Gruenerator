-- Wolke-Ordner als Projektwissen (#5945, experimentell). Eine Zeile je an ein
-- Projekt gehängten Ordner. Gelesen wird mit dem Freigabelink der Person, die
-- ihn angehängt hat (`user_id`); `synced_files` merkt sich, welche Datei
-- (WebDAV-href) zu welchem `documents`-Eintrag wurde, damit eine aus dem Ordner
-- gelöschte Datei auch aus dem Projekt verschwindet.
CREATE TABLE IF NOT EXISTS group_wolke_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    share_link_id TEXT NOT NULL,
    folder_path TEXT NOT NULL DEFAULT '/',
    folder_name TEXT NOT NULL,
    include_subfolders BOOLEAN NOT NULL DEFAULT TRUE,
    synced_files JSONB NOT NULL DEFAULT '{}'::jsonb,
    file_count INTEGER NOT NULL DEFAULT 0,
    pending_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, share_link_id, folder_path)
);

CREATE INDEX IF NOT EXISTS idx_group_wolke_folders_group ON group_wolke_folders(group_id);
