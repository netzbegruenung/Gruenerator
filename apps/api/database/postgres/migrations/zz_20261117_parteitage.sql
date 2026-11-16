-- Parteitage: Reden von Parteitagen (Video, Transkript, Analyse). Medien liegen
-- in system_media (nicht pro Person, kein Papierkorb). Eine Rede, die ein Admin
-- entfernt hat, steht in convention_deleted_speeches, damit der Re-Import sie
-- nicht still zurueckholt. Kein Geschlechtsfeld, nur die Platzart.
CREATE TABLE IF NOT EXISTS system_media (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    storage_key TEXT NOT NULL UNIQUE,
    mime_type   TEXT NOT NULL,
    size_bytes  BIGINT NOT NULL,
    duration_s  NUMERIC NULL,
    width       INTEGER NULL,
    height      INTEGER NULL,
    sha256      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conventions (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key                  TEXT NOT NULL UNIQUE,
    slug_suffix          TEXT NOT NULL UNIQUE,
    slug_name            TEXT NOT NULL,
    title                TEXT NOT NULL,
    short_title          TEXT NOT NULL,
    organizer            TEXT NOT NULL,
    audience             TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('de-DE', 'de-AT', 'all')),
    starts_on            DATE NOT NULL,
    ends_on              DATE NOT NULL,
    location             TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
    access_password_hash TEXT NULL,
    stats                JSONB NOT NULL DEFAULT '{}'::jsonb,
    stats_version        INTEGER NOT NULL DEFAULT 1,
    source_links         JSONB NOT NULL DEFAULT '[]'::jsonb,
    report_media_id      UUID NULL REFERENCES system_media(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at         TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_conventions_status ON conventions (status);

CREATE TABLE IF NOT EXISTS convention_speeches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    convention_id   UUID NOT NULL REFERENCES conventions(id) ON DELETE CASCADE,
    speech_key      TEXT NOT NULL,
    slug_suffix     TEXT NOT NULL UNIQUE,
    day             DATE NOT NULL,
    day_label       TEXT NOT NULL,
    list_place      INTEGER NOT NULL,
    seat_type       TEXT NOT NULL CHECK (seat_type IN ('frauenplatz', 'offen')),
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    kv              TEXT NOT NULL,
    area            TEXT NOT NULL CHECK (area IN ('kreisfreie_stadt', 'kreis', 'ohne')),
    contested       BOOLEAN NOT NULL,
    elected         BOOLEAN NULL,
    result_percent  NUMERIC NULL,
    delivered_by    TEXT NULL,
    topic           TEXT NOT NULL,
    duration_s      NUMERIC NOT NULL,
    word_count      INTEGER NOT NULL,
    transcript      TEXT NOT NULL,
    words           JSONB NOT NULL DEFAULT '[]'::jsonb,
    analysis        JSONB NOT NULL DEFAULT '{}'::jsonb,
    reel_media_id   UUID NOT NULL REFERENCES system_media(id) ON DELETE RESTRICT,
    poster_media_id UUID NOT NULL REFERENCES system_media(id) ON DELETE RESTRICT,
    moderation      TEXT NOT NULL DEFAULT 'ok' CHECK (moderation IN ('ok', 'hidden')),
    hidden_reason   TEXT NULL,
    UNIQUE (convention_id, speech_key)
);

CREATE INDEX IF NOT EXISTS idx_convention_speeches_place
    ON convention_speeches (convention_id, list_place);

CREATE TABLE IF NOT EXISTS convention_access (
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    convention_id UUID NOT NULL REFERENCES conventions(id) ON DELETE CASCADE,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, convention_id)
);

CREATE TABLE IF NOT EXISTS convention_deleted_speeches (
    convention_id UUID NOT NULL REFERENCES conventions(id) ON DELETE CASCADE,
    speech_key    TEXT NOT NULL,
    deleted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (convention_id, speech_key)
);
