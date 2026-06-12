-- Tiptap migration: about content moves into sections.about as ProseMirror
-- JSON; theme contents switch from markdown strings to ProseMirror JSON.
-- No site is live yet, so legacy markdown-format rows are reset rather than
-- converted, and the now-unused bio column is dropped.
UPDATE user_sites SET sections = '{}'::jsonb;

ALTER TABLE user_sites DROP COLUMN IF EXISTS bio;
