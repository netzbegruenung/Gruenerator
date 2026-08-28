-- Gespeicherte WebDAV-Etags tragen HTML-escapte Anführungszeichen (#3039).
--
-- Der Regex-Parser strippte nur echte Anführungszeichen, Nextcloud schickt sie
-- aber entity-escapt: gespeichert wurde `&quot;abc123&quot;` statt `abc123`.
-- Genau ein Verbraucher hat das lokal repariert (der Scraper-Pfad), der
-- Sync-Pfad nicht. `WolkeSyncService.hasFileChanged` vergleicht den
-- gespeicherten gegen einen frisch gelesenen Etag — bei einer escapt
-- geschriebenen Zeile schlägt der Vergleich also DAUERHAFT an, und die Datei
-- gilt bei jedem Lauf als geändert. Das ist pro Datei und Lauf ein Download,
-- ein OCR-Aufruf und ein Embedding-Lauf für etwas, das sich nicht geändert hat
-- — genau die Kosten, gegen die das Etag-Gatter existiert.
--
-- Die Reihenfolge ist der Grund, warum das hier steht und nicht als Handgriff
-- auf der Datenbank: der Schreiber ist seit #3036 repariert
-- (`normalizeWebdavEtag` an der Quelle), und Migrationen laufen beim Start
-- GENAU DES BILDES, das diese Reparatur mitbringt. Vorher ausgeführt hätte der
-- Backfill nur die Seite gewechselt, auf der der Vergleich falsch liegt.
--
-- Ohne diesen Backfill heilt sich das auch selbst — jede betroffene Datei
-- synchronisiert genau einmal und schreibt dabei einen sauberen Etag. Die
-- Zeilenzahl war nur nie gemessen, und ungemessen ist „einmalig" keine
-- Zusicherung, sondern eine Hoffnung. Also misst die Migration selbst und
-- schreibt die Zahl ins Startprotokoll.
--
-- Ersetzt wird ausschließlich `&quot;` — genau das, was `normalizeWebdavEtag`
-- entfernt. Eine andere Entity (`&#34;`) würde der Schreiber heute NICHT
-- strippen; sie hier zu entfernen erzeugte denselben Dauer-Fehlschlag in der
-- Gegenrichtung.
DO $$
DECLARE
  touched_documents bigint := 0;
  touched_collab bigint := 0;
BEGIN
  UPDATE documents
  SET wolke_etag = replace(wolke_etag, '&quot;', '')
  WHERE wolke_etag LIKE '%&quot;%';
  GET DIAGNOSTICS touched_documents = ROW_COUNT;

  -- `collaborative_documents.wolke_etag` steht nicht in schema.sql, sondern
  -- kommt aus `add_wolke_link_to_collaborative_documents.sql`. Alphabetisch
  -- läuft die davor — aber auf die Sortierung zu bauen wäre eine Annahme, und
  -- die Spaltenprüfung kostet nichts.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'collaborative_documents'
      AND column_name = 'wolke_etag'
  ) THEN
    UPDATE collaborative_documents
    SET wolke_etag = replace(wolke_etag, '&quot;', '')
    WHERE wolke_etag LIKE '%&quot;%';
    GET DIAGNOSTICS touched_collab = ROW_COUNT;
  END IF;

  RAISE NOTICE 'wolke_etag unescaped: % documents, % collaborative_documents (#3039)',
    touched_documents, touched_collab;
END $$;
