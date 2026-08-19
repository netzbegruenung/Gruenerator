-- better-auth 1.7 keys external accounts on (issuer, accountId) instead of
-- (userId, providerId). Expand step: add the column and its lookup index so the
-- 1.7 upgrade finds the shape it needs. Deliberately no backfill here — the
-- issuer value derives from KEYCLOAK_BASE_URL/KEYCLOAK_REALM and differs per
-- environment, so it is filled at boot (backfillAccountIssuer.ts), which also
-- catches rows 1.6.x keeps writing until the upgrade lands.
--
-- Safe under 1.6.x: the column is nullable and nothing reads it.
--
-- NOTE: all four provider_ids (keycloak-netzbegruenung, -gruenes-netz,
-- -gruene-at, -gruenerator) are kc_idp_hints into ONE Keycloak realm and
-- therefore share a single OIDC issuer. Under 1.7's keying they collapse to one
-- identity per accountId. Rows that share (account_id) across two provider_ids
-- would become duplicates; audit before the 1.7 cutover.

ALTER TABLE ba_accounts ADD COLUMN IF NOT EXISTS issuer TEXT;

CREATE INDEX IF NOT EXISTS idx_ba_accounts_issuer_account
  ON ba_accounts(issuer, account_id);
