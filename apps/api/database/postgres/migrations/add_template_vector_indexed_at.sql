-- Track when a user_template's vector (title + description + tags) was last
-- indexed into Qdrant. Used to mark rows as freshly enriched after the
-- fire-and-forget vision + embedding pass. Nullable: legacy rows are unindexed
-- until next edit/enrichment.
ALTER TABLE user_templates ADD COLUMN IF NOT EXISTS vector_indexed_at TIMESTAMPTZ;
