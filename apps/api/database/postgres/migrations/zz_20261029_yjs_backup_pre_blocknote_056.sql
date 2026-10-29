-- Safety copy of the document history before BlockNote 0.56 (#5150) serves it.
--
-- #5150 replaces the snapshot routes with BlockNote's version history on
-- yjs_document_snapshots and restores forward into the live doc. An upgrade
-- emulation found nothing overwritten, but the history has no undo of its own:
-- the 90-day cleanup and the document purge delete snapshot rows hard. Taking
-- the copy in a migration means it happens on every instance, once, before the
-- new code answers its first request — not as a manual step before a deploy.
--
-- Recovery: the tables have the columns of their source in the same order, so
-- `INSERT INTO yjs_document_snapshots SELECT * FROM … WHERE …` restores rows.
--
-- Privacy: a backup must not outlive what it copies. document_id references
-- collaborative_documents ON DELETE CASCADE, so purging a document (trash purge,
-- account deletion) removes its copy too; rows of documents that no longer exist
-- are not copied. created_by mirrors the source's ON DELETE SET NULL. Expired
-- auto-saves are cleaned here by the same rule as in the source table
-- (services/hocuspocus/src/persistence.ts, cleanupOldSnapshots).
--
-- Drop both tables with a later migration once the 0.56 rollout is confirmed.

CREATE TABLE IF NOT EXISTS yjs_document_snapshots_backup_bn056
    (LIKE yjs_document_snapshots INCLUDING ALL);

CREATE TABLE IF NOT EXISTS yjs_document_updates_backup_bn056
    (LIKE yjs_document_updates INCLUDING ALL);

ALTER TABLE yjs_document_snapshots_backup_bn056
    ADD CONSTRAINT yjs_document_snapshots_backup_bn056_document_fk
        FOREIGN KEY (document_id) REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    ADD CONSTRAINT yjs_document_snapshots_backup_bn056_created_by_fk
        FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE yjs_document_updates_backup_bn056
    ADD CONSTRAINT yjs_document_updates_backup_bn056_document_fk
        FOREIGN KEY (document_id) REFERENCES collaborative_documents(id) ON DELETE CASCADE;

INSERT INTO yjs_document_snapshots_backup_bn056
SELECT s.* FROM yjs_document_snapshots s
WHERE EXISTS (SELECT 1 FROM collaborative_documents d WHERE d.id = s.document_id)
  AND (s.created_by IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = s.created_by));

INSERT INTO yjs_document_updates_backup_bn056
SELECT u.* FROM yjs_document_updates u
WHERE EXISTS (SELECT 1 FROM collaborative_documents d WHERE d.id = u.document_id);

COMMENT ON TABLE yjs_document_snapshots_backup_bn056 IS
    'Copy of yjs_document_snapshots taken before BlockNote 0.56 (#5150). Drop after the rollout is confirmed.';
COMMENT ON TABLE yjs_document_updates_backup_bn056 IS
    'Copy of yjs_document_updates taken before BlockNote 0.56 (#5150). Drop after the rollout is confirmed.';
