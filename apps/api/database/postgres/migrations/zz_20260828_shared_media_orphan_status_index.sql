-- The orphan reaper (uploadsCleanupService → reapOrphanedShares, #2989) runs
-- every 6 hours and asks for exactly one thing: rows in 'processing'/'failed'
-- older than a day. A partial index answers that without a sequential scan over
-- the whole table, and it stays tiny — after the first cleanup cycle it indexes
-- only the handful of rows written since.
--
-- The predicate must match the reaper's WHERE for the planner to use it; if that
-- status list ever changes, this index changes with it.
CREATE INDEX IF NOT EXISTS idx_shared_media_orphan_status
  ON shared_media (created_at)
  WHERE status IN ('processing', 'failed');
