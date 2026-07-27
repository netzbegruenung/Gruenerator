-- Server-set provenance for the Studio gallery split (Sharepics vs KI-Bilder).
--
-- Until now both frontends classified an image by `image_type`, a free-text
-- column the CLIENT supplies. It is unreliable by construction: only template
-- configs carry a `legacyType`, KI configs fall back to their canonical id or to
-- '' (stored as NULL), and `updateImageShare` cannot rewrite the column — so a
-- NULL written during the first draft autosave is permanent, and the image sits
-- in the wrong section forever.
--
-- `content_origin` is set by the server instead, from a closed set. It is
-- deliberately separate from `upload_source`, which answers a different question
-- ("how did these bytes arrive") and drives library curation.

ALTER TABLE shared_media
  ADD COLUMN IF NOT EXISTS content_origin TEXT NOT NULL DEFAULT 'unknown';

-- Spelled out here as well as in schema.sql: syncSchemaColumns() adds missing
-- columns to existing tables but never applies CHECK constraints, so a database
-- that already has shared_media would otherwise never get this one.
ALTER TABLE shared_media
  DROP CONSTRAINT IF EXISTS shared_media_content_origin_check;
ALTER TABLE shared_media
  ADD CONSTRAINT shared_media_content_origin_check
  CHECK (content_origin IN ('ki', 'sharepic', 'upload', 'unknown'));

-- Backfill. Order matters: each rule only touches rows still marked 'unknown',
-- so the most conclusive signal has to run first.

-- 1. Genuine uploads. `createImageShare` decodes a data URI and can only ever
--    produce image/jpeg or image/png, so webp/gif proves the bytes came through
--    the upload endpoint; `original_filename` is likewise only ever written by
--    uploadMediaFile.
UPDATE shared_media
SET content_origin = 'upload'
WHERE media_type = 'image'
  AND content_origin = 'unknown'
  AND (
    original_filename IS NOT NULL
    OR mime_type IN ('image/webp', 'image/gif')
  );

-- 2. KI Studio output: the canonical ids the bild-editor writes, the two legacy
--    aliases still sitting in older rows, and the two metadata shapes only the
--    KI flows produce.
UPDATE shared_media
SET content_origin = 'ki'
WHERE media_type = 'image'
  AND content_origin = 'unknown'
  AND (
    image_type IN ('pure-create', 'universal-edit', 'green-edit', 'ai-editor', 'imagine', 'edit')
    OR image_metadata ? 'kiConfig'
    OR image_metadata->>'source' = 'bild-editor'
  );

-- 3. Template sharepics, in both spellings the write paths produced: the
--    PascalCase `legacyType` names from the image-studio flow, and the lowercase
--    canvas config ids the canvas editor passes straight through. Verified
--    against real rows — the lowercase spelling is the common one and matched
--    nothing before.
--
--    Two things are deliberately NOT signals here: `image_metadata.sharepicType`
--    (both flows write it) and the literal image_type 'sharepic' (mobile's share
--    modal writes it for KI results too). Rows carrying only those stay
--    'unknown', which is honest and keeps them findable for a later pass.
UPDATE shared_media
SET content_origin = 'sharepic'
WHERE media_type = 'image'
  AND content_origin = 'unknown'
  AND image_type IN (
    'Dreizeilen', 'Zitat', 'Info', 'Simple', 'Slider', 'Veranstaltung',
    'Profilbild', 'Freeform', 'Zitat_Pure', 'InfoAt', 'ZitatAt',
    'ZitatPureAt', 'DreizeilenAt', 'FreeformAt',
    'dreizeilen', 'zitat', 'info', 'simple', 'slider', 'veranstaltung',
    'profilbild', 'freeform', 'zitat-pure', 'info-at', 'zitat-at',
    'zitat-pure-at', 'dreizeilen-at', 'freeform-at'
  );

-- Everything left keeps 'unknown': rows whose image_type was never written, and
-- rows from callers we cannot identify after the fact. Both galleries show an
-- unknown row among the sharepics, exactly as they did before this column
-- existed — so nothing moves for them, it is only labelled truthfully now.
