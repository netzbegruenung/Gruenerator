-- Normalized monitor_articles table for watcher search
-- Replaces JSONB articles blob with indexed, deduplicated rows

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS monitor_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  source TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'de',
  published_at TIMESTAMPTZ,
  primary_topic TEXT,
  topic_scores JSONB DEFAULT '{}',
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);

-- Trigram indexes for fast ILIKE search (watcher feature)
CREATE INDEX IF NOT EXISTS idx_monitor_articles_title_trgm ON monitor_articles USING GIN(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_monitor_articles_excerpt_trgm ON monitor_articles USING GIN(excerpt gin_trgm_ops);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_monitor_articles_seen ON monitor_articles(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_articles_locale ON monitor_articles(locale);
CREATE INDEX IF NOT EXISTS idx_monitor_articles_topic ON monitor_articles(primary_topic);

-- Drop articles column from snapshots (now in normalized table)
-- Keep column for backward compat but stop writing to it
ALTER TABLE monitor_snapshots ALTER COLUMN articles SET DEFAULT '[]';
