-- Gespeicherte Reisekostenabrechnungen (Entwürfe und eingereichte).
--
-- `state` ist der Formularzustand OHNE Adresse, Telefon und Bankverbindung —
-- die bleiben im Browser; `reisekostenServerStateSchema` streift sie am
-- HTTP-Rand ab. `belege` trägt nur Metadaten (Kategorie, Betrag, Hash), nie
-- die Dateien selbst.
--
-- Papierkorb: Löschen setzt `deleted_at`; der Slug-Suffix ist nur unter
-- lebenden Zeilen eindeutig (Konvention aus zz_20260929b_trash_partial_unique.sql).
CREATE TABLE IF NOT EXISTS reisekosten_abrechnungen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    slug_suffix TEXT NOT NULL,
    titel TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf', 'eingereicht')),
    state JSONB NOT NULL,
    belege JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reisekosten_abrechnungen_user_updated
    ON reisekosten_abrechnungen (user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reisekosten_abrechnungen_slug_suffix
    ON reisekosten_abrechnungen (slug_suffix) WHERE deleted_at IS NULL;

-- Purge-Worker: abgelaufene Papierkorb-Zeilen.
CREATE INDEX IF NOT EXISTS idx_reisekosten_abrechnungen_trashed
    ON reisekosten_abrechnungen (deleted_at) WHERE deleted_at IS NOT NULL;
