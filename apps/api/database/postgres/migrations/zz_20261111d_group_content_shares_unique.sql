-- Eine Freigabe je (Projekt, Typ, Inhalt).
--
-- Bis hierher verhinderte nur ein SELECT vor dem INSERT doppelte Zeilen; ein
-- Doppelklick oder zwei Geräte gleichzeitig legten zwei an, und Kommentare und
-- Reaktionen landeten dann an verschiedenen Zeilen derselben Freigabe. Ab jetzt
-- schreibt `services/groups/groupShareWriter.ts` mit ON CONFLICT DO NOTHING.
--
-- Bestehende Doppelte werden auf die älteste Zeile zusammengeführt, ohne
-- etwas zu verlieren: Kommentare und Reaktionen wandern um (eine Reaktion, die
-- dieselbe Person mit demselben Emoji schon an der behaltenen Zeile hat, fällt
-- weg), Notiz und Anheftung übernimmt die behaltene Zeile, wenn sie selbst
-- keine hat, und Schreibrecht bleibt, wenn eine der Zeilen es gab — niemand
-- verliert einen Zugriff, den er heute hat. Zeilen ohne Projekt (group_id NULL)
-- bleiben unberührt; der Index zählt NULL ohnehin nicht als gleich.

CREATE TEMP TABLE gcs_dupes ON COMMIT DROP AS
SELECT id, keeper_id
  FROM (
    SELECT id,
           first_value(id) OVER w AS keeper_id
      FROM group_content_shares
     WHERE group_id IS NOT NULL
    WINDOW w AS (PARTITION BY group_id, content_type, content_id
                 ORDER BY shared_at ASC NULLS LAST, id ASC)
  ) ranked
 WHERE id <> keeper_id;

UPDATE group_content_shares k
   SET note = COALESCE(k.note, m.note),
       pinned_at = COALESCE(k.pinned_at, m.pinned_at),
       pinned_by = CASE WHEN k.pinned_at IS NULL THEN m.pinned_by ELSE k.pinned_by END,
       permissions = CASE
         WHEN m.any_write AND COALESCE((k.permissions->>'write')::boolean, false) = false
           THEN COALESCE(k.permissions, '{}'::jsonb) || '{"write": true}'::jsonb
         ELSE k.permissions
       END
  FROM (
    SELECT d.keeper_id,
           (array_agg(s.note ORDER BY s.shared_at) FILTER (WHERE s.note IS NOT NULL))[1] AS note,
           (array_agg(s.pinned_at ORDER BY s.pinned_at) FILTER (WHERE s.pinned_at IS NOT NULL))[1] AS pinned_at,
           (array_agg(s.pinned_by ORDER BY s.pinned_at) FILTER (WHERE s.pinned_at IS NOT NULL))[1] AS pinned_by,
           bool_or(COALESCE((s.permissions->>'write')::boolean, false)) AS any_write
      FROM gcs_dupes d
      JOIN group_content_shares s ON s.id = d.id
     GROUP BY d.keeper_id
  ) m
 WHERE k.id = m.keeper_id;

UPDATE group_share_comments c
   SET share_id = d.keeper_id
  FROM gcs_dupes d
 WHERE c.share_id = d.id;

DELETE FROM entity_reactions r
 USING gcs_dupes d
 WHERE r.group_share_id = d.id
   AND EXISTS (
     SELECT 1 FROM entity_reactions k
      WHERE k.group_share_id = d.keeper_id AND k.user_id = r.user_id AND k.emoji = r.emoji
   );

-- Zwei Doppelte mit derselben Reaktion derselben Person: nur eine wandert um.
DELETE FROM entity_reactions r
 USING gcs_dupes d
 WHERE r.group_share_id = d.id
   AND EXISTS (
     SELECT 1 FROM entity_reactions o
       JOIN gcs_dupes od ON od.id = o.group_share_id
      WHERE od.keeper_id = d.keeper_id AND o.user_id = r.user_id AND o.emoji = r.emoji
        AND (o.created_at, o.id) < (r.created_at, r.id)
   );

UPDATE entity_reactions r
   SET group_share_id = d.keeper_id
  FROM gcs_dupes d
 WHERE r.group_share_id = d.id;

DELETE FROM group_content_shares s
 USING gcs_dupes d
 WHERE s.id = d.id;

-- Ersetzt den gleichspaltigen, nicht eindeutigen Index aus schema.sql.
DROP INDEX IF EXISTS idx_group_content_shares_group_content;
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_content_shares_target
    ON group_content_shares (group_id, content_type, content_id);
