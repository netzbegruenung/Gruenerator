-- Podcasts: eine Chat- oder Notebook-Antwort als Zwei-Stimmen-Gespräch
-- (services/podcasts/). Der Worker schreibt erst das Skript, dann vertont er es
-- und legt das MP3 als Mediathek-Audio an (`media_id` zeigt auf
-- die shared_media-Zeile). Löschen läuft über die Mediathek; ist das Audio weg,
-- bleibt die Zeile mit `media_id` NULL und die Seite zeigt das an.
CREATE TABLE IF NOT EXISTS podcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_text TEXT NOT NULL,
    script JSONB,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'scripting', 'voicing', 'ready', 'failed')),
    error TEXT,
    voice_a VARCHAR(16) NOT NULL,
    voice_b VARCHAR(16) NOT NULL,
    locale VARCHAR(5) NOT NULL DEFAULT 'de-DE'
        CHECK (locale IN ('de-DE', 'de-AT')),
    media_id UUID REFERENCES shared_media(id) ON DELETE SET NULL,
    duration_seconds REAL,
    claim_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_podcasts_user_created
    ON podcasts (user_id, created_at DESC);

-- Worker-Queue.
CREATE INDEX IF NOT EXISTS idx_podcasts_pending
    ON podcasts (created_at) WHERE status IN ('queued', 'scripting', 'voicing');
