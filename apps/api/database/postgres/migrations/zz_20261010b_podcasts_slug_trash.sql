-- Podcasts bekommen eine Notion-URL (/podcast/<slug>-<suffix>) und wandern
-- beim Löschen in den Papierkorb. Eigene Datei, weil zz_20261010_podcasts.sql
-- auf Entwicklungsdatenbanken schon gelaufen ist.
ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS slug_suffix VARCHAR(12);
ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Gleiches Alphabet wie generateSlugSuffix (packages/shared/src/utils/slug.ts),
-- sonst findet extractSlugSuffix den Schlüssel in der URL nicht.
UPDATE podcasts p
   SET slug_suffix = (
     SELECT string_agg(
              substr('abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                     1 + floor(random() * 56)::int, 1), '')
       FROM generate_series(1, 6)
      WHERE p.id IS NOT NULL
   )
 WHERE slug_suffix IS NULL;
ALTER TABLE podcasts ALTER COLUMN slug_suffix SET NOT NULL;

-- Eindeutig nur unter lebenden Zeilen (zz_20260929b_trash_partial_unique.sql).
CREATE UNIQUE INDEX IF NOT EXISTS uq_podcasts_slug_suffix
    ON podcasts (slug_suffix) WHERE deleted_at IS NULL;

-- Purge-Worker: abgelaufene Papierkorb-Zeilen.
CREATE INDEX IF NOT EXISTS idx_podcasts_trashed
    ON podcasts (deleted_at) WHERE deleted_at IS NOT NULL;
