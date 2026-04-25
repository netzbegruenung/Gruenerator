-- Add NLP-derived columns to monitor_articles
-- emotion_scores: per-article emotion intensities (angst, wut, hoffnung, ...)
-- top_nouns: ranked nouns extracted by the NLP service for keyword aggregation
ALTER TABLE monitor_articles
  ADD COLUMN IF NOT EXISTS emotion_scores JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS top_nouns JSONB DEFAULT '[]'::jsonb;
