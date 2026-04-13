-- Fix profile-deletion FK constraints (v2)
--
-- Replaces fix_profile_deletion_fk_constraints.sql which fails on
-- environments where the original FK constraint has a different name
-- than the one the migration tries to drop. The v1 migration
-- unconditionally `ALTER TABLE ... DROP CONSTRAINT <hardcoded_name>`,
-- which fails (rolling back the whole transaction) on any environment
-- where that exact name doesn't exist.
--
-- Concrete failure observed 2026-04-12 on the test deploy:
--   ❌ Migration fix_profile_deletion_fk_constraints.sql failed:
--       constraint "yjs_document_snapshots_created_by_fkey" of relation
--       "yjs_document_snapshots" does not exist
-- The constraint exists, just under a different name. The v1 migration
-- has been failing on every startup since then, leaving the FK behavior
-- as RESTRICT (which blocks profile deletion / off-boarding).
--
-- This v2 finds the FK constraint by table+column relationship via
-- information_schema instead of by name, drops whatever name it has,
-- and re-adds it with a known name and the correct ON DELETE SET NULL
-- behavior. Works on any environment regardless of historical naming.
--
-- Goal: chat_messages.user_id, wolke_sync_status.synced_by_user_id, and
-- yjs_document_snapshots.created_by all use ON DELETE SET NULL so that
-- deleting a profile doesn't fail with a RESTRICT violation.
--
-- Note: this migration unconditionally enforces SET NULL on all three
-- columns. If a different delete rule was deliberately set elsewhere,
-- it will be overwritten. Adjust here if you need a different behavior.
--
-- Transaction is managed by the migration runner — do not add BEGIN/COMMIT.

-- ============================================================================
-- chat_messages.user_id → profiles.id
-- ============================================================================
DO $$
DECLARE
    existing_constraint TEXT;
BEGIN
    SELECT tc.constraint_name INTO existing_constraint
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'chat_messages'
      AND tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'user_id'
    LIMIT 1;

    IF existing_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE chat_messages DROP CONSTRAINT %I', existing_constraint);
    END IF;

    ALTER TABLE chat_messages
        ADD CONSTRAINT chat_messages_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- ============================================================================
-- wolke_sync_status.synced_by_user_id → profiles.id
-- ============================================================================
DO $$
DECLARE
    existing_constraint TEXT;
BEGIN
    SELECT tc.constraint_name INTO existing_constraint
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'wolke_sync_status'
      AND tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'synced_by_user_id'
    LIMIT 1;

    IF existing_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE wolke_sync_status DROP CONSTRAINT %I', existing_constraint);
    END IF;

    ALTER TABLE wolke_sync_status
        ADD CONSTRAINT wolke_sync_status_synced_by_user_id_fkey
        FOREIGN KEY (synced_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- ============================================================================
-- yjs_document_snapshots.created_by → profiles.id
-- ============================================================================
DO $$
DECLARE
    existing_constraint TEXT;
BEGIN
    SELECT tc.constraint_name INTO existing_constraint
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'yjs_document_snapshots'
      AND tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'created_by'
    LIMIT 1;

    IF existing_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE yjs_document_snapshots DROP CONSTRAINT %I', existing_constraint);
    END IF;

    ALTER TABLE yjs_document_snapshots
        ADD CONSTRAINT yjs_document_snapshots_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;
