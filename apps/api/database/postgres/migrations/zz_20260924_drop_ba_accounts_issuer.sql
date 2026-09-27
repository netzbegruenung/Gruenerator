-- Contract zu add_better_auth_v17_accounts_issuer.sql. better-auth 1.7.0–1.7.2
-- schlüsselte Konten auf (issuer, accountId); 1.7.3 hat das zurückgenommen und
-- erkennt Konten wieder an (providerId, accountId) wie 1.6. Die Spalte wurde
-- nur vom Boot-Backfill beschrieben und nie gelesen.
DROP INDEX IF EXISTS idx_ba_accounts_issuer_account;
ALTER TABLE ba_accounts DROP COLUMN IF EXISTS issuer;
