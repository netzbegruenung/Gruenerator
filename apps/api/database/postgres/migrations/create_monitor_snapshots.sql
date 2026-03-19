-- Monitor Snapshots table for Grünerator Monitor feature
-- Stores hourly topic analysis snapshots from RSS feeds + NLP classification

CREATE TABLE IF NOT EXISTS monitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_articles INT NOT NULL,
  sources TEXT[] NOT NULL,
  topic_scores JSONB NOT NULL,
  articles JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitor_snapshots_created ON monitor_snapshots(created_at DESC);
