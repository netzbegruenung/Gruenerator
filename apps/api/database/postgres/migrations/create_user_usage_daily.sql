-- Per-user consumption tracking, aggregated into daily buckets.
--
-- One row per (user, day, feature, provider, model, unit). LLM calls fill the
-- token columns; non-LLM operations (image generation, transcription, web
-- research) leave tokens at 0 and count `ops` instead — `unit` disambiguates.
--
-- Written exclusively by UsageTrackingService, which buffers in memory and
-- flushes batched increments, so several cluster workers can upsert the same
-- key concurrently and Postgres adds them up.

CREATE TABLE IF NOT EXISTS user_usage_daily (
  user_id UUID NOT NULL,
  day DATE NOT NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'tokens',
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  ops INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_usage_daily_pk PRIMARY KEY (user_id, day, feature, provider, model, unit)
);

CREATE INDEX IF NOT EXISTS idx_user_usage_daily_user_day
  ON user_usage_daily (user_id, day DESC);
