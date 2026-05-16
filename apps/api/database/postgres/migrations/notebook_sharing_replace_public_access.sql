-- Drop the dormant notebook_public_access table.
--
-- The primary store for token-based public-notebook links was always the Qdrant
-- collection of the same name (NotebookQdrantHelper.createPublicAccess). The
-- Postgres table at schema.sql:371 was declared but never written to or read from
-- — confirmed by codebase grep. Dropping it is housekeeping.
--
-- The new notebook sharing model (share_mode: private | groups | authenticated,
-- edit_policy: owner_only | group_admins | all_members) is stored on the Qdrant
-- notebook_collections payload; group shares reuse the polymorphic
-- group_content_shares table with content_type='notebook_collections'.

DROP TABLE IF EXISTS notebook_public_access CASCADE;
