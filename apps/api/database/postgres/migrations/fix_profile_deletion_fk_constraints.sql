-- Fix FK constraints that block profile deletion (missing ON DELETE action)
-- These 3 constraints default to RESTRICT, causing account deletion to fail

-- chat_messages.user_id: SET NULL to preserve messages in shared threads
ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_user_id_fkey;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- wolke_sync_status.synced_by_user_id: SET NULL to preserve sync audit trail
ALTER TABLE wolke_sync_status DROP CONSTRAINT wolke_sync_status_synced_by_user_id_fkey;
ALTER TABLE wolke_sync_status ADD CONSTRAINT wolke_sync_status_synced_by_user_id_fkey
    FOREIGN KEY (synced_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- yjs_document_snapshots.created_by: SET NULL to preserve doc snapshots
ALTER TABLE yjs_document_snapshots DROP CONSTRAINT yjs_document_snapshots_created_by_fkey;
ALTER TABLE yjs_document_snapshots ADD CONSTRAINT yjs_document_snapshots_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
