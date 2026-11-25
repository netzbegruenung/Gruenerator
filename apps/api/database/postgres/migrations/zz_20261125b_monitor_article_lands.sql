-- Bundesländer a monitor article belongs to (services/monitor/laender.ts),
-- decided at ingest. Read by the Land view of /briefing (`?land=`) through
-- `$1 = ANY(lands)`, hence the GIN index. Rows written before this migration
-- keep '{}' and age out with the 7-day retention; the next hourly refresh
-- re-tags every article it sees again.
ALTER TABLE monitor_articles
    ADD COLUMN IF NOT EXISTS lands TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_monitor_articles_lands ON monitor_articles USING GIN(lands);
