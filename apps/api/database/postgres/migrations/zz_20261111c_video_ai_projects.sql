-- KI-Schnitt (services/videoAi/): Rohvideos aus der Mediathek rein, ein
-- editierbarer Schnittplan raus. Die Tabelle ist zugleich die Worker-Queue
-- (FOR UPDATE SKIP LOCKED, wie podcasts).
--
-- `inputs`: [{id: 'c1'|'a1', mediaId, role, title}] in Sende-Reihenfolge.
-- `analysis`: Transkript-Einheiten, Detektoren, Bildbeschreibungen und die
--   Arbeitskopien (proxy shared_media-IDs) — vor dem ersten Gemma-Aufruf
--   gespeichert, damit ein Wiederholungsversuch nichts doppelt bezahlt.
-- `versions`: [{version, edl, summary, omitted, rationale, createdAt}];
--   jede Korrekturrunde hängt eine an, `current_version` zeigt auf die gewählte.
-- `tree_units`/`tree_day`: beim Anlegen gebuchte Bäume, für die Rückgabe bei
--   einem Fehlschlag gegen den eigenen Tag.
CREATE TABLE IF NOT EXISTS video_ai_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    slug_suffix VARCHAR(12) NOT NULL,
    title TEXT NOT NULL,
    locale VARCHAR(5) NOT NULL DEFAULT 'de-DE'
        CHECK (locale IN ('de-DE', 'de-AT')),
    brief JSONB NOT NULL,
    inputs JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'analyzing', 'cutting', 'designing', 'ready', 'failed', 'cancelled')),
    error TEXT,
    warnings JSONB NOT NULL DEFAULT '[]',
    analysis JSONB,
    versions JSONB NOT NULL DEFAULT '[]',
    current_version INTEGER,
    tree_units INTEGER NOT NULL DEFAULT 0,
    tree_day VARCHAR(10),
    handed_off_at TIMESTAMPTZ,
    claim_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_ai_projects_user_created
    ON video_ai_projects (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_video_ai_projects_slug_suffix
    ON video_ai_projects (slug_suffix) WHERE deleted_at IS NULL;

-- Worker-Queue.
CREATE INDEX IF NOT EXISTS idx_video_ai_projects_pending
    ON video_ai_projects (created_at)
    WHERE status IN ('queued', 'analyzing', 'cutting', 'designing');
