import { env } from './env.js';

/**
 * Der OIDC-`issuer`, auf den alle vier Provider-Kennungen hinauslaufen.
 *
 * `keycloak-netzbegruenung`, `-gruenes-netz`, `-gruene-at` und `-gruenerator`
 * sind `kc_idp_hint`s in EINE Keycloak-Realm — der `iss`-Claim ist für alle
 * identisch. Seit better-auth 1.7 ist dieser Wert Teil des Kontoschlüssels
 * (`(issuer, accountId)`), deshalb steht die Formel an genau einer Stelle:
 * `betterAuth.ts` gibt sie dem Provider mit, `backfillAccountIssuer` stempelt
 * den Altbestand damit. Zwei Herleitungen desselben Werts wären hier kein
 * Schönheitsfehler, sondern ein Kontoschlüssel, der auseinanderläuft.
 */
export function keycloakIssuer(): string {
  return `${env.KEYCLOAK_BASE_URL.replace(/\/$/, '')}/realms/${env.KEYCLOAK_REALM}`;
}
