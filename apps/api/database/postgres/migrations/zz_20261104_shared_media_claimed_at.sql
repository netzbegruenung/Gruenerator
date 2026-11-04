-- Wann ein Studio-Galerieelement diesen Upload übernommen hat (#4555).
-- Wird nie zurückgesetzt: ein gepurgtes, einst öffentliches Element lässt seine
-- Datei für die Designs anderer liegen, und nur dieser Stempel hält den Sweep
-- für nie übernommene Uploads davon fern.
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Bestand: jeder Upload, auf den heute ein Element zeigt (auch im Papierkorb),
-- gilt als übernommen. Der Purge lief bis hierher nur im Probelauf, es gibt
-- also keine gepurgten Elemente, deren Upload ohne Zeile dasteht.
UPDATE shared_media sm
   SET claimed_at = sa.created_at
  FROM studio_assets sa
 WHERE sa.media_id = sm.id
   AND sm.claimed_at IS NULL;
