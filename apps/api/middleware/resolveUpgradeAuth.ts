/**
 * Anmeldung und Art.-9-Einwilligung für WebSocket-Upgrades.
 *
 * Ein `server.on('upgrade', …)`-Handler läuft am Express-Stack vorbei —
 * `requireAuth` und `requireAiConsent` sehen ihn nie. Diese Funktion ist das
 * Gegenstück für solche Pfade, in derselben Rolle wie `hasAiConsent()` beim
 * MCP-Server: eine ausdrückliche Prüfung dort, wo die Middleware-Kette nicht
 * hinreicht.
 *
 * Der Handshake trägt die Anmeldung im Cookie: `new WebSocket(url)` erlaubt
 * keine eigenen Kopfzeilen, aber der Browser hängt bei gleichem Ursprung die
 * `ba.session_token`-Cookies an — und alle Aufrufer von `/api/voice/realtime`
 * sind Web-Oberflächen mit gleichem Ursprung (`@gruenerator/voice` ist aus dem
 * Native-Einstieg von `packages/chat` ausgenommen, Mobile diktiert über den
 * OS-Erkenner). Ein Bearer-Token über `Sec-WebSocket-Protocol` wäre die
 * Erweiterung, sobald ein Client ohne Cookie dazukommt.
 */

import { fromNodeHeaders } from 'better-auth/node';

import { auth } from '../config/betterAuth.js';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

import { hasAiConsent } from './requireAiConsent.js';

import type { IncomingMessage } from 'node:http';

const log = createLogger('upgradeAuth');

/** Warum ein Upgrade abgelehnt wurde — bestimmt den HTTP-Status der Absage. */
export type UpgradeDenial = 'unauthorized' | 'consent_required';

export type UpgradeAuthResult = { ok: true; userId: string } | { ok: false; reason: UpgradeDenial };

/**
 * Dev-Bypass über die Abfrage, nicht über die Kopfzeile: `new WebSocket()`
 * kann `x-dev-auth-bypass` nicht setzen. `requireAuth` akzeptiert denselben
 * Parameter (`req.query.dev_auth_token`), die Regeln sind also dieselben —
 * nur in `development` und nur mit passendem Token.
 */
function devBypassUserId(url: URL): string | null {
  if (env.NODE_ENV !== 'development' || !env.ALLOW_DEV_AUTH_BYPASS) return null;
  if (env.DEV_AUTH_BYPASS_TOKEN == null) return null;
  return url.searchParams.get('dev_auth_token') === env.DEV_AUTH_BYPASS_TOKEN
    ? '00000000-0000-4000-a000-000000000001'
    : null;
}

export async function resolveUpgradeAuth(
  request: IncomingMessage,
  url: URL
): Promise<UpgradeAuthResult> {
  const bypassId = devBypassUserId(url);
  if (bypassId) return { ok: true, userId: bypassId };

  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    userId = session?.user?.id ?? null;
  } catch (err) {
    // Anders als bei `requireAuth` gibt es hier kein 503-Äquivalent, das der
    // Client sinnvoll auswerten könnte: der Kanal steht entweder oder nicht.
    // Eine Störung der Anmeldung schließt ihn — sie öffnet ihn nicht.
    log.warn('[Upgrade] Sitzungsauflösung fehlgeschlagen: %s', (err as Error).message);
    return { ok: false, reason: 'unauthorized' };
  }

  if (!userId) return { ok: false, reason: 'unauthorized' };
  if (!(await hasAiConsent(userId))) return { ok: false, reason: 'consent_required' };
  return { ok: true, userId };
}

/**
 * Upgrade ablehnen. Vor dem Handshake gibt es noch keinen WebSocket, über den
 * man einen Fehler senden könnte — also eine rohe HTTP-Antwort auf den Socket,
 * dann zu.
 */
export function denyUpgrade(
  socket: NodeJS.WritableStream & { destroy: () => void },
  reason: UpgradeDenial
): void {
  const status = reason === 'consent_required' ? '403 Forbidden' : '401 Unauthorized';
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
