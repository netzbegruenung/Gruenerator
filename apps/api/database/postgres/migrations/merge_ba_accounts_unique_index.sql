-- Letzter Schritt der Kontoidentität: `issuer` wird Pflicht und
-- `(issuer, account_id)` eindeutig — das Modell, auf dem better-auth 1.7 ein
-- externes Konto erkennt. Setzt merge_ba_accounts_dubletten.sql voraus.
--
-- REIHENFOLGE: `backfillAccountIssuer` läuft in PostgresService.init() NACH
-- den Migrationen. Landen Vorbereitung und dieser Schritt im selben Start,
-- ist `issuer` hier noch leer und die Migration bricht ab; der Runner schluckt
-- das, der Backfill läuft, und der nächste Start zieht sie nach. Auf Test und
-- Prod passiert das nicht, weil die Vorbereitung (#2721) einen Deploy früher
-- ausgeliefert wird.

DO $$
DECLARE offen INTEGER;
BEGIN
  SELECT count(*) INTO offen FROM ba_accounts WHERE issuer IS NULL;
  IF offen > 0 THEN
    RAISE EXCEPTION
      'ba_accounts.issuer ist bei % Zeile(n) leer — backfillAccountIssuer läuft erst nach den Migrationen. Beim nächsten Start greift diese Migration.',
      offen;
  END IF;
END $$;

ALTER TABLE ba_accounts ALTER COLUMN issuer SET NOT NULL;

-- Der nicht-eindeutige Index aus der Vorbereitung wird vom eindeutigen
-- vollständig abgedeckt.
DROP INDEX IF EXISTS idx_ba_accounts_issuer_account;

CREATE UNIQUE INDEX IF NOT EXISTS ba_accounts_issuer_account_uidx
  ON ba_accounts(issuer, account_id);
