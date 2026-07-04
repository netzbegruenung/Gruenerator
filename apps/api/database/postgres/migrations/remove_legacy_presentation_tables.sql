-- Drop the orphaned legacy presentations tables.
--
-- These were created by the removed apps/docs presentation editor (see
-- add_presentations.sql / fix_presentations_user_id_type.sql). No code reads or
-- writes them anymore — the new reveal.js presentations feature stores decks in
-- collaborative_documents with document_subtype = 'presentations' instead.
--
-- Filename deliberately sorts AFTER fix_presentations_user_id_type.sql: the
-- runner applies pending migrations alphabetically, so on a fresh database
-- add_ → fix_ (ALTER on the existing table) → remove_ (this drop) run in order.
-- A "drop_"-prefixed name would sort between add_ and fix_ and make fix_ ALTER a
-- table this migration had already dropped.
--
-- No BEGIN/COMMIT: the migration runner wraps each file in a transaction.
-- Drop the child (FK) table first.
DROP TABLE IF EXISTS presentation_slides;
DROP TABLE IF EXISTS collaborative_presentations;
