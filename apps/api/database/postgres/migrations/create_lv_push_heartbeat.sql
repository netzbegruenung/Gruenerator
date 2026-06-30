-- Landesverband push heartbeat.
--
-- One row per LV source id. The push-ingest endpoint
-- (/api/landesverbaende/ingest) upserts last_push_at on every successful
-- ingest/delete. The scheduled LandesverbandScraper reads this and skips a
-- source that has pushed within PUSH_FRESHNESS_HOURS, so the WordPress plugin
-- becomes the default path while the scraper stays an automatic backstop.
--
-- No BEGIN/COMMIT: the migration runner wraps each file in a transaction.

CREATE TABLE IF NOT EXISTS lv_push_heartbeat (
  source_id    TEXT PRIMARY KEY,
  last_push_at TIMESTAMPTZ NOT NULL
);
