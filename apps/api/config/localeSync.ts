/**
 * Der einzige Ort, an dem ein Login das Land eines Profils schreibt.
 *
 * Drei der vier Keycloak-IdPs nennen ein Land, einer nicht:
 *
 *   keycloak-gruene-at       → de-AT   (Die Grünen Österreich)
 *   keycloak-gruenes-netz    → de-DE   (Grünes Netz, Bündnis 90/Die Grünen)
 *   keycloak-netzbegruenung  → de-DE   (Netzbegrünung, deutscher Verein)
 *   keycloak-gruenerator       — kein Ländersignal; wird derzeit nicht genutzt
 *
 * Der Unterschied zu vorher steckt nicht in dieser Liste, sondern in dem, was
 * FEHLT: das `?? 'de-DE'`, das jeden unbekannten IdP still zu einem deutschen
 * machte. Ein fehlender Eintrag ist jetzt eine Aussage („dieser IdP sagt nichts
 * über das Land"), kein Loch, das mit Deutschland gestopft wird. Kein Signal,
 * kein Schreiben — das Profil behält NULL, und die Oberfläche fragt nach.
 *
 * `locale_source` entscheidet, wer gewinnt:
 *   'user' — selbst gewählt. Unantastbar. Vorher lief `syncLocaleFromProvider`
 *            in `account.update.after`, also bei JEDEM Login: wer sein Land in
 *            den Einstellungen korrigierte und danach über einen deutschen IdP
 *            einloggte, wurde stumm zurückgesetzt.
 *   'idp'   — vom IdP gesetzt. Ein länder-autoritativer Login darf das ändern
 *            (Konto wechselt zum AT-IdP → Land zieht mit).
 *   NULL    — unbekannt, wird vom ersten autoritativen Login gefüllt.
 */
import { eq } from 'drizzle-orm';

import * as schema from '../database/schema/index.js';
import { setUserLocale } from '../services/localization/localeCache.js';
import { createLogger } from '../utils/logger.js';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const log = createLogger('localeSync');

export type SupportedLocale = 'de-DE' | 'de-AT';

/**
 * IdP → Land, aber NUR für die IdPs, die tatsächlich eines bezeichnen. Ein
 * fehlender Eintrag ist eine Aussage („dieser IdP sagt nichts über das Land"),
 * kein Loch, das mit Deutschland gestopft werden darf.
 *
 * `keycloak-gruenerator` steht bewusst nicht hier: der Login wird derzeit nicht
 * verwendet, und sollte er wieder in Betrieb gehen, ist er für Mitarbeitende in
 * beiden Ländern gedacht. Er müsste dann ein echtes Ländersignal mitbringen —
 * bis dahin bleibt das Profil leer und wird gefragt.
 */
export const PROVIDER_LOCALE: Record<string, SupportedLocale> = {
  'keycloak-gruene-at': 'de-AT',
  'keycloak-gruenes-netz': 'de-DE',
  'keycloak-netzbegruenung': 'de-DE',
};

type Db = NodePgDatabase<typeof schema>;

/**
 * Trägt das Land des IdP ins Profil ein, sofern der IdP eines nennt und die
 * Person nicht selbst schon gewählt hat. Best effort: ein Fehler hier darf den
 * Login nicht scheitern lassen.
 */
export async function syncLocaleFromProvider(
  db: Db,
  userId: string,
  providerId: string
): Promise<void> {
  const locale = PROVIDER_LOCALE[providerId];
  if (!locale) return;

  try {
    const rows = await db
      .select({ locale: schema.profiles.locale, source: schema.profiles.locale_source })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, userId))
      .limit(1);

    const row = rows[0];
    if (row?.source === 'user') {
      log.debug(
        `[Auth] locale-sync skipped user=${userId} provider=${providerId} — eigene Wahl (${row.locale ?? 'none'})`
      );
      return;
    }

    if (row?.locale === locale && row.source === 'idp') return;

    await db
      .update(schema.profiles)
      .set({ locale, locale_source: 'idp' })
      .where(eq(schema.profiles.id, userId));
    await setUserLocale(userId, locale);

    log.info(
      `[Auth] locale-synced user=${userId} provider=${providerId} ${row?.locale ?? 'none'} → ${locale}`
    );
  } catch (err) {
    log.warn(`[Auth] locale sync failed user=${userId}: ${(err as Error).message}`);
  }
}
