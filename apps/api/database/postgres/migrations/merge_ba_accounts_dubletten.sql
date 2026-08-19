-- better-auth 1.7 erkennt ein externes Konto an `(issuer, accountId)` und legt
-- darauf einen UNIQUE-Index. Unsere vier "Provider" sind aber EINE
-- Keycloak-Realm: `keycloak-netzbegruenung`, `-gruenes-netz`, `-gruene-at` und
-- `-gruenerator` sind `kc_idp_hint`s in dieselbe Realm und teilen damit den
-- issuer. Wer sich über zwei Hints angemeldet hat, hat zwei Zeilen mit
-- derselben `account_id` — unter 1.7 eine Identität, unter unserem alten
-- Unique auf `(user_id, provider_id)` zwei erlaubte Zeilen.
--
-- Auf Prod betrifft das 502 `account_id`s. Ohne diesen Schritt lässt sich der
-- UNIQUE-Index nicht anlegen.
--
-- Gruppiert wird über `provider_id LIKE 'keycloak-%'` und NICHT über `issuer`:
-- der Runner führt Migrationen VOR den Backfills aus, `issuer` ist hier also
-- noch leer. Weil alle vier denselben issuer tragen, ist das Ergebnis
-- identisch — gemessen gegen synthetische Kollisionen.
--
-- Gelöscht wird nichts. Die weichenden Zeilen wandern nach
-- `ba_accounts_dubletten_v16` und tragen dort, wohin sie zusammengeführt
-- wurden. Nichts referenziert `ba_accounts.id`, das ist folgenlos.

CREATE TABLE IF NOT EXISTS ba_accounts_dubletten_v16 (
  LIKE ba_accounts INCLUDING DEFAULTS
);

ALTER TABLE ba_accounts_dubletten_v16 ADD COLUMN IF NOT EXISTS gewinner_id TEXT;
ALTER TABLE ba_accounts_dubletten_v16 ADD COLUMN IF NOT EXISTS gewinner_user_id UUID;
ALTER TABLE ba_accounts_dubletten_v16
  ADD COLUMN IF NOT EXISTS zusammengefuehrt_am TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Welche Zeile bleibt: ist `keycloak-gruene-at` in der Gruppe, gewinnt sie.
-- Grund ist nicht Höflichkeit, sondern `PROVIDER_LOCALE` in
-- config/betterAuth.ts — die Sprache wird aus `provider_id` abgeleitet. Fiele
-- die AT-Zeile weg, kippte der Mensch beim nächsten Login auf de-DE.
-- Sonst gewinnt die zuletzt aktive Zeile.
WITH kollision AS (
  SELECT account_id
  FROM ba_accounts
  WHERE provider_id LIKE 'keycloak-%'
  GROUP BY 1
  HAVING count(*) > 1
),
gewinner AS (
  SELECT DISTINCT ON (a.account_id) a.account_id, a.id, a.user_id
  FROM ba_accounts a
  JOIN kollision k USING (account_id)
  WHERE a.provider_id LIKE 'keycloak-%'
  ORDER BY a.account_id,
           (a.provider_id = 'keycloak-gruene-at') DESC,
           a.updated_at DESC NULLS LAST,
           a.id
),
weichende AS (
  SELECT a.*, g.id AS gewinner_id, g.user_id AS gewinner_user_id
  FROM ba_accounts a
  JOIN gewinner g USING (account_id)
  WHERE a.provider_id LIKE 'keycloak-%'
    AND a.id <> g.id
),
archiviert AS (
  INSERT INTO ba_accounts_dubletten_v16
  SELECT w.*, NOW() FROM weichende w
  ON CONFLICT DO NOTHING
  RETURNING id
)
DELETE FROM ba_accounts WHERE id IN (SELECT id FROM archiviert);

-- Ab hier muss jede `account_id` genau einmal vorkommen. Der Runner schluckt
-- Migrationsfehler und bootet weiter, deshalb bricht das hier hart ab statt
-- die Lücke dem UNIQUE-Index zu überlassen.
DO $$
DECLARE rest INTEGER;
BEGIN
  SELECT count(*) INTO rest FROM (
    SELECT account_id FROM ba_accounts
    WHERE provider_id LIKE 'keycloak-%'
    GROUP BY 1 HAVING count(*) > 1
  ) t;
  IF rest > 0 THEN
    RAISE EXCEPTION 'Zusammenführung unvollständig: % account_id(s) kommen weiterhin mehrfach vor', rest;
  END IF;
END $$;
