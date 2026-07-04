-- Drop the orphaned legacy presentations tables.
--
-- These were created by the removed apps/docs presentation editor (see
-- add_presentations.sql / fix_presentations_user_id_type.sql). No code reads or
-- writes them anymore — the new reveal.js presentations feature stores decks in
-- collaborative_documents with document_subtype = 'presentations' instead.
--
-- No BEGIN/COMMIT: the migration runner wraps each file in a transaction.
-- Drop the child (FK) table first.
DROP TABLE IF EXISTS presentation_slides;
DROP TABLE IF EXISTS collaborative_presentations;
