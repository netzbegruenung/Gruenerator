-- Woher das Land eines Profils stammt — und Rücksetzen der Werte, die nie mehr
-- als eine Vermutung waren.
--
-- Bisher leitete sich `locale` allein aus dem Keycloak-IdP ab, und alles, was
-- kein Land nannte, fiel auf 'de-DE'. Drei der vier IdPs bezeichnen tatsächlich
-- ein Land (gruene-at → AT; gruenes-netz und netzbegruenung → DE); nur der
-- Grünerator-Login tut es nicht — er ist für Mitarbeitende in beiden Ländern
-- gedacht und wird derzeit nicht verwendet. Für ihn und für Profile ohne jedes
-- Signal war 'de-DE' geraten, nicht erhoben. Dazu kam: weil
-- `syncLocaleFromProvider` bei JEDEM Login lief, hat es eine Korrektur in den
-- Einstellungen beim nächsten Login wieder überschrieben.
--
-- `locale_source` trennt beides:
--   'idp'  — ein länder-autoritativer IdP hat es gesagt (gruene-at, gruenes-netz)
--   'user' — die Person hat es selbst gewählt; ab dann fasst kein Login es mehr an
--   NULL   — unbekannt; die Oberfläche fragt nach, statt Deutschland anzunehmen
--
-- Der Backfill unten läuft genau einmal (schema_migrations kennt den Dateinamen),
-- deshalb darf er Vermutungen gefahrlos auf NULL zurücksetzen: eine später in den
-- Einstellungen getroffene Wahl trägt 'user' und wird davon nie wieder berührt.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS locale_source TEXT CHECK (locale_source IN ('idp', 'user'));

-- Der DEFAULT muss weg, sonst schreibt jeder INSERT ohne locale-Spalte weiterhin
-- still 'de-DE' in ein Profil, über dessen Land nichts bekannt ist.
ALTER TABLE profiles
  ALTER COLUMN locale DROP DEFAULT;

DO $$
BEGIN
  IF to_regclass('public.ba_accounts') IS NOT NULL THEN
    -- 1. Länder-autoritative IdPs: das Land steht fest.
    UPDATE profiles p
    SET locale = 'de-AT', locale_source = 'idp'
    FROM ba_accounts a
    WHERE a.user_id = p.id
      AND a.provider_id = 'keycloak-gruene-at';

    UPDATE profiles p
    SET locale = 'de-DE', locale_source = 'idp'
    FROM ba_accounts a
    WHERE a.user_id = p.id
      AND a.provider_id IN ('keycloak-gruenes-netz', 'keycloak-netzbegruenung')
      AND p.locale_source IS NULL
      -- Wer BEIDE Konten verknüpft hat, bleibt bei de-AT: das AT-Konto ist das
      -- speziellere Signal. Die deutschen IdPs stehen auch österreichischen
      -- Mitarbeitenden offen, das AT-Konto dagegen nur österreichischen.
      AND NOT EXISTS (
        SELECT 1 FROM ba_accounts at_acc
        WHERE at_acc.user_id = p.id AND at_acc.provider_id = 'keycloak-gruene-at'
      );
  END IF;

  -- 2. Profile ohne Konto-Zeile (Altbestand vor Better Auth): auth_source ist das
  --    einzige verbliebene Signal. mapKeycloakProfileToUser hängte historisch ein
  --    zweites '-login' an, daher wird auf Teilzeichenketten geprüft.
  UPDATE profiles
  SET locale = 'de-AT', locale_source = 'idp'
  WHERE locale_source IS NULL
    AND (auth_source LIKE '%gruene-at%' OR auth_source LIKE '%gruene-oesterreich%');

  UPDATE profiles
  SET locale = 'de-DE', locale_source = 'idp'
  WHERE locale_source IS NULL
    AND (auth_source LIKE '%gruenes-netz%' OR auth_source LIKE '%netzbegruenung%');

  -- 3. Alle übrigen: der länderneutrale Grünerator-Login oder gar kein Signal.
  --    Ihr 'de-DE' war geraten und wird zurückgenommen — die Oberfläche fragt
  --    einmalig nach.
  UPDATE profiles
  SET locale = NULL
  WHERE locale_source IS NULL
    AND locale IS NOT NULL;
END $$;
