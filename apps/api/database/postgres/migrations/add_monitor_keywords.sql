-- Add keywords column to monitor_snapshots
ALTER TABLE monitor_snapshots ADD COLUMN IF NOT EXISTS keywords JSONB DEFAULT '[]';
