-- `user_uploads` has never had a writer (#2982).
--
-- It exists in schema.sql and in the Drizzle model, and the only reference
-- anywhere else was a `db.delete` during account offboarding — which was
-- already redundant, since the table's user_id carries
-- `REFERENCES profiles(id) ON DELETE CASCADE`. Every real upload goes to
-- `shared_media` via `SharedMediaService.uploadMediaFile`. `git log -S` over the
-- full history finds no INSERT: the table only ever appeared in type
-- declarations. Its cost is that it looks like the place uploads live, to anyone
-- searching for them.
--
-- The drop refuses to destroy data it was not able to inspect beforehand. The
-- issue asked for a production row count first and that check could not be run
-- from a workstation, so it runs here, where it can:
--
--   * empty (expected on every environment)  → dropped, recorded, done.
--   * non-empty                              → EXCEPTION. The transaction rolls
--     back, nothing is deleted, the runner logs the failure and does NOT record
--     the migration, so this repeats on every boot until someone decides what
--     the rows are. Boot itself is unaffected: `runSingleMigration` catches.
--
-- If it ever does fire: no code reads those rows today, so nothing surfaces them
-- to users either way. Either migrate them into `shared_media` or delete this
-- file after dropping the table by hand.
DO $$
DECLARE
  remaining bigint;
BEGIN
  IF to_regclass('public.user_uploads') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.user_uploads' INTO remaining;

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'user_uploads still holds % row(s) — refusing to drop. Nothing reads them (see #2982); decide whether to migrate them into shared_media or remove them, then drop the table by hand.',
      remaining;
  END IF;

  DROP TABLE public.user_uploads;
  RAISE NOTICE 'Dropped dead table user_uploads (0 rows)';
END $$;
