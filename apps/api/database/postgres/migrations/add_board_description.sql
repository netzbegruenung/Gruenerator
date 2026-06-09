-- Board-level description (board-overview briefing, markdown).
-- Boards are collaborative_documents rows (document_subtype='boards'); the column
-- is nullable and only populated for boards. No BEGIN/COMMIT — the migration
-- runner wraps each file in a transaction (PostgresService.init()).

ALTER TABLE collaborative_documents
    ADD COLUMN IF NOT EXISTS description TEXT;
