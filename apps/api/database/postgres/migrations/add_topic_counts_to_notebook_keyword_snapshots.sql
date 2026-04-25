-- Stores monthly NLP-classified topic counts alongside the keyword snapshot.
-- Shape: { migration: 12, klima: 4, ... } keyed by TopicCategory.
-- Populated by the same monthly cron that fills `keywords`. Reads happen via
-- the notebook stats endpoint so user-facing requests never hit NLP inline.

ALTER TABLE notebook_keyword_snapshots
  ADD COLUMN IF NOT EXISTS topic_counts JSONB NOT NULL DEFAULT '{}';
