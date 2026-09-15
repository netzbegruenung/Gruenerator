-- Remember URLs the scraper fetched and then threw away, so it stops paying for
-- them once a night (#3200).
--
-- The age filter sits AFTER the fetch (DocumentProcessor STEP 2): the scraper
-- downloads the page, extracts it, reads published_at and only then rejects it.
-- A rejected document stores nothing, so it leaves no point in Qdrant — and
-- both cheap gates in front of the fetch (#storedPayload / isFreshlyIndexed)
-- key on a stored point. The URL is therefore invisible to every gate, forever,
-- and gets fetched again on every walk. Measured for Berlin on 2026-09-15: 105
-- of 375 discovered URLs fetched-then-discarded in a single *hourly* run.
--
-- Only monotone rejections belong here. 'too_old' is the one that can never
-- reverse on its own: a document does not become younger, so a cached decision
-- stays correct. 'too_short' and 'no_chunks' are NOT cached — a stub page can
-- be filled in later, and remembering it would make that update invisible.
--
-- published_at is NOT NULL on purpose. It is what makes the row re-decidable
-- rather than a plain blocklist: the gate re-evaluates the stored date against
-- the source's current maxAgeYears, so widening the window brings those URLs
-- back on the next run without a manual purge.
CREATE TABLE IF NOT EXISTS scraper_rejected_urls (
    source_url TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The gate loads one source's rejections in a single query per content path,
-- rather than asking per URL, so source_id is the only access path.
CREATE INDEX IF NOT EXISTS idx_scraper_rejected_source
    ON scraper_rejected_urls (source_id);
