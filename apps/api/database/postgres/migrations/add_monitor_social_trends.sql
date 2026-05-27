-- Add social_trends column to monitor_snapshots
-- Stores Twitter/Bluesky trending topics captured during each refresh.
-- saveSnapshotAggregates() has inserted into this column (and getLatestSnapshot()
-- read it) since the feature shipped, but the column was never created — every
-- refresh therefore failed with PG 42703 (undefined column).
ALTER TABLE monitor_snapshots ADD COLUMN IF NOT EXISTS social_trends JSONB DEFAULT '[]'::jsonb;
