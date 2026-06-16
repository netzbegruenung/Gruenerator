-- Stores the most frequently mentioned person names alongside the keyword snapshot.
-- Shape: [{ person: 'Jarasch', count: 12 }, ...] ranked by document frequency.
-- Populated by the same monthly cron that fills `keywords` (spaCy NER, PER entities).
-- Reads happen via the notebook stats endpoint so user-facing requests never hit NLP inline.

ALTER TABLE notebook_keyword_snapshots
  ADD COLUMN IF NOT EXISTS persons JSONB NOT NULL DEFAULT '[]';
