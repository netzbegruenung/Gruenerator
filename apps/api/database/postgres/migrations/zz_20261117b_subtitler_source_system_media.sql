-- Simple Reel aus einer Parteitags-Rede: das Projekt verweist auf die Videodatei
-- im Systemspeicher, statt sie zu kopieren. Wird die Rede entfernt, wird die
-- Referenz NULL und das Projekt-Video liefert 410 SOURCE_GONE.
ALTER TABLE subtitler_projects
    ADD COLUMN IF NOT EXISTS source_system_media_id UUID NULL REFERENCES system_media(id) ON DELETE SET NULL;
