-- Short article excerpt for the blog-style "Was ist passiert" feed cards,
-- captured at sync time by the scrapers (first ~300 chars of the text).
ALTER TABLE content_sync_articles ADD COLUMN IF NOT EXISTS excerpt TEXT;
