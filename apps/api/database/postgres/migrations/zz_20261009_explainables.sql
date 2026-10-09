-- Explainables: ein Quelltext in einfacher Sprache als feste Erklärseite mit
-- bis zu drei FLUX-Bildern (services/explainables/).
--
-- `content` ist `explainableContentSchema` (@gruenerator/contracts); der
-- Bild-Worker setzt den Status je Bild per jsonb_set. `reserved_units` sind die
-- beim Anlegen gebuchten, noch nicht abgerechneten Baum-Einheiten des Tages
-- `reserved_day` — Worker und Löschen geben zurück, was nicht verbraucht wurde.
--
-- Papierkorb: Löschen setzt `deleted_at`; der Slug-Suffix ist nur unter
-- lebenden Zeilen eindeutig (Konvention aus zz_20260929b_trash_partial_unique.sql).
CREATE TABLE IF NOT EXISTS explainables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES chat_threads(id) ON DELETE SET NULL,
    source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    slug_suffix VARCHAR(12) NOT NULL,
    title TEXT NOT NULL,
    content JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'images_pending'
        CHECK (status IN ('images_pending', 'ready', 'failed')),
    share_mode TEXT NOT NULL DEFAULT 'private'
        CHECK (share_mode IN ('private', 'authenticated', 'public')),
    share_token VARCHAR(32),
    reserved_units INTEGER NOT NULL DEFAULT 0,
    reserved_day DATE,
    claim_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_explainables_user_created
    ON explainables (user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_explainables_slug_suffix
    ON explainables (slug_suffix) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_explainables_share_token
    ON explainables (share_token) WHERE share_token IS NOT NULL;

-- Bild-Worker-Queue.
CREATE INDEX IF NOT EXISTS idx_explainables_images_pending
    ON explainables (created_at) WHERE status = 'images_pending';

-- Purge-Worker: abgelaufene Papierkorb-Zeilen.
CREATE INDEX IF NOT EXISTS idx_explainables_trashed
    ON explainables (deleted_at) WHERE deleted_at IS NOT NULL;
