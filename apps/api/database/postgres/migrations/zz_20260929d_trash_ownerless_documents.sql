-- Account deletion used to leave the user's collaborative documents behind
-- with created_by = NULL (the FK is ON DELETE SET NULL) and, unless someone
-- else held an owner entry, no owner at all (#3845). Nobody could delete them
-- and the purge worker only sees trashed rows. Move those to the Papierkorb:
-- the worker removes them after the retention period, and until then the rows
-- are still there to recover by hand. New account deletions purge such
-- documents directly (ProfileService.deleteProfile).
UPDATE collaborative_documents d
SET is_deleted = true, deleted_at = now()
WHERE d.created_by IS NULL
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(
      CASE WHEN jsonb_typeof(d.permissions) = 'object' THEN d.permissions ELSE '{}'::jsonb END
    ) p
    JOIN profiles pr ON pr.id::text = p.key
    WHERE p.value ->> 'level' = 'owner'
  );
