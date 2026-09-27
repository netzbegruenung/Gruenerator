-- Kommentar-Threads im Gruppen-Feed: eine Antwort hängt an einem
-- Kommentar oberster Ebene (eine Ebene tief, Antworten auf Antworten
-- landen beim selben Kommentar). Rein additiv; alte Clients schreiben
-- weiter ohne parent_id und sehen einen flachen Thread.
-- Wird der Kommentar oben gelöscht, bleiben die Antworten als eigene
-- Kommentare stehen, statt fremde Texte mitzureißen.
ALTER TABLE group_share_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES group_share_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_share_comments_parent
  ON group_share_comments (parent_id)
  WHERE parent_id IS NOT NULL;
