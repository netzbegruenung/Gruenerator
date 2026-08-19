/**
 * Boot-time backfill: stamp `ba_accounts.issuer` on every row that predates the
 * better-auth 1.7 account rekeying.
 *
 * 1.7 keys external accounts on `(issuer, accountId)` and makes `Account.issuer`
 * required. All four provider ids (`keycloak-netzbegruenung`, `-gruenes-netz`,
 * `-gruene-at`, `-gruenerator`) are `kc_idp_hint`s into ONE Keycloak realm, so
 * they resolve to a single OIDC issuer — the realm URL, which is exactly what
 * Keycloak mints as the `iss` claim.
 *
 * Deliberately NOT marker-guarded like the slug backfills: until the 1.7 upgrade
 * lands, better-auth 1.6.x keeps creating account rows without an issuer, so this
 * has to catch stragglers on every boot. It stays cheap because the predicate is
 * `issuer IS NULL` and the column is indexed.
 *
 * Runs after PostgresService finishes its SQL migrations.
 */

import { keycloakIssuer } from '../../config/keycloakIssuer.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('backfillAccountIssuer');

export { keycloakIssuer };

export async function backfillAccountIssuer(): Promise<void> {
  const issuer = keycloakIssuer();
  const postgres = getPostgresInstance();
  const updated = await postgres.query<{ id: string }>(
    `UPDATE ba_accounts
        SET issuer = $1
      WHERE issuer IS NULL
        AND provider_id LIKE 'keycloak-%'
      RETURNING id`,
    [issuer]
  );

  if (updated.length > 0) {
    log.info(`stamped issuer on ${updated.length} account row(s) → ${issuer}`);
  }
}
