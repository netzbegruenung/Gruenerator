-- Add EventRegistry sentiment score to monitor articles
ALTER TABLE monitor_articles ADD COLUMN IF NOT EXISTS er_sentiment FLOAT;
