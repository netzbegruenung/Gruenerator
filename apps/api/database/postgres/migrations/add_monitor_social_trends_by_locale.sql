-- Per-locale X/Twitter trends on monitor_snapshots.
-- `social_trends` holds a single list scraped from trends24.in/germany/, which
-- getLatestSnapshot() handed to the Austrian snapshot unchanged (#2878). The
-- new column keys the lists by monitor locale: {"de": [...], "at": [...]}.
-- Additive on purpose: `social_trends` keeps receiving the German list so rows
-- written before this migration stay readable.
ALTER TABLE monitor_snapshots
    ADD COLUMN IF NOT EXISTS social_trends_by_locale JSONB DEFAULT '{}'::jsonb;
