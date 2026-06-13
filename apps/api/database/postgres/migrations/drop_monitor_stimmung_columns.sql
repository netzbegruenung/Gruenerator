-- Stimmung (emotion/sentiment) feature removed: drop the per-article emotion
-- aggregation columns. top_nouns stays (still powers keyword aggregation).
ALTER TABLE monitor_articles DROP COLUMN IF EXISTS emotion_scores;
ALTER TABLE monitor_articles DROP COLUMN IF EXISTS er_sentiment;
