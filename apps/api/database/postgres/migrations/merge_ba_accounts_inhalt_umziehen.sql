-- Nachtrag zu merge_ba_accounts_dubletten.sql, bewusst als eigene Datei:
-- zurücknehmbar, ohne die Konto-Zusammenführung selbst anzufassen.
--
-- Bei 497 der 502 Kollisionen gehörten alle Zeilen demselben Profil — da ist
-- mit dem Archivieren der Dublette alles getan. Bei 5 Kollisionen hängen ZWEI
-- Profile an derselben Keycloak-Identität: ein Mensch mit zwei
-- E-Mail-Adressen, der sich zweimal registriert hat. Deren Inhalt zieht auf
-- das überlebende Profil um.
--
-- Die verlierenden `profiles`-Zeilen bleiben stehen. Sie zu löschen würde über
-- ON DELETE CASCADE genau das zerstören, was hier gerettet wird.
--
-- Welche Tabellen: über ALLE 58 Fremdschlüssel auf `profiles` gezählt, nicht
-- geschätzt. Auf Prod liegen an den 5 Profilen 5 user_documents,
-- 4 generation_logs und 3 chat_threads — sonst nichts. Der Wächter am Ende
-- bricht ab, falls doch etwas anderes auftaucht.

CREATE TEMP TABLE umzug AS
SELECT DISTINCT d.user_id, d.gewinner_user_id
FROM ba_accounts_dubletten_v16 d
WHERE d.gewinner_user_id IS NOT NULL
  AND d.user_id <> d.gewinner_user_id;

-- Ein Profil, das anderswo selbst gewinnt, darf nicht ausgeräumt werden.
-- Kommt in den gemessenen Daten nicht vor; wäre es doch so, ist es ein Fall
-- für einen Menschen und nicht für eine Migration.
DO $$
DECLARE beides INTEGER;
BEGIN
  SELECT count(*) INTO beides
  FROM umzug u
  WHERE EXISTS (SELECT 1 FROM umzug v WHERE v.gewinner_user_id = u.user_id);
  IF beides > 0 THEN
    RAISE EXCEPTION 'Abbruch: % Profil(e) sind zugleich Gewinner und Verlierer', beides;
  END IF;
END $$;

UPDATE user_documents t SET user_id = u.gewinner_user_id
  FROM umzug u WHERE t.user_id = u.user_id;

UPDATE generation_logs t SET user_id = u.gewinner_user_id
  FROM umzug u WHERE t.user_id = u.user_id;

UPDATE chat_threads t SET user_id = u.gewinner_user_id
  FROM umzug u WHERE t.user_id = u.user_id;

-- Angemeldete Sitzungen ziehen mit um statt zu sterben. Der Mensch bleibt
-- eingeloggt und sieht ab dem nächsten Aufruf das zusammengeführte Profil.
-- Ohne das bricht die Migration an jeder Sitzung ab, die zwischen Messung und
-- Lauf entsteht — und Sitzungen entstehen laufend.
UPDATE ba_sessions t SET user_id = u.gewinner_user_id
  FROM umzug u WHERE t.user_id = u.user_id;

-- Wächter: bleibt an einem verlierenden Profil irgendwo sonst eine Zeile
-- hängen, bricht die Migration ab, statt sie still verwaisen zu lassen.
-- Zuschreibungs-Spalten (created_by, shared_by_user_id, reviewed_by,
-- last_edited_by …) werden bewusst NICHT umgezogen — das wäre
-- Historienfälschung —, tauchen hier aber auf, damit jemand hinsieht.
DO $$
DECLARE
  f RECORD;
  zeilen BIGINT;
  reste TEXT := '';
BEGIN
  FOR f IN
    SELECT c.conrelid::regclass::text AS tab, a.attname AS spalte
    FROM pg_constraint c
    JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON TRUE
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid = 'profiles'::regclass
      AND NOT (c.conrelid::regclass::text = 'ba_accounts' AND a.attname = 'user_id')
      AND NOT (c.conrelid::regclass::text = 'ba_sessions' AND a.attname = 'user_id')
      AND NOT (c.conrelid::regclass::text = 'user_documents' AND a.attname = 'user_id')
      AND NOT (c.conrelid::regclass::text = 'generation_logs' AND a.attname = 'user_id')
      AND NOT (c.conrelid::regclass::text = 'chat_threads' AND a.attname = 'user_id')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %I IN (SELECT user_id FROM umzug)',
      f.tab, f.spalte
    ) INTO zeilen;
    IF zeilen > 0 THEN
      reste := reste || format('%s.%s=%s ', f.tab, f.spalte, zeilen);
    END IF;
  END LOOP;

  IF reste <> '' THEN
    RAISE EXCEPTION 'Abbruch: an verlierenden Profilen hängen unbehandelte Zeilen: %', reste;
  END IF;
END $$;
