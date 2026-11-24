-- Synchronisierte Ablagen als Projektwissen (#5945, experimentell): ein
-- Wolke-Ordner oder eine Auswahl von Google-Drive-Dateien je Zeile. Gelesen wird
-- mit der Verbindung der Person, die sie angehängt hat (`user_id`).
--   provider 'wolke':        share_link_id + folder_path benennen den Ordner.
--   provider 'google-drive': picked_files hält die im Picker gewählten Dateien
--                            (Scope drive.file sieht nur diese); eine Zeile je
--                            Person und Projekt, weitere Auswahl hängt an.
-- `synced_files` merkt sich je Datei (WebDAV-href bzw. Drive-Id) den
-- `documents`-Eintrag und seine Version, damit eine verschwundene Datei auch aus
-- dem Projekt verschwindet.
CREATE TABLE IF NOT EXISTS group_cloud_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('wolke', 'google-drive')),
    share_link_id TEXT NOT NULL DEFAULT '',
    folder_path TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    include_subfolders BOOLEAN NOT NULL DEFAULT TRUE,
    picked_files JSONB NOT NULL DEFAULT '[]'::jsonb,
    synced_files JSONB NOT NULL DEFAULT '{}'::jsonb,
    file_count INTEGER NOT NULL DEFAULT 0,
    pending_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, user_id, provider, share_link_id, folder_path)
);

CREATE INDEX IF NOT EXISTS idx_group_cloud_sources_group ON group_cloud_sources(group_id);
