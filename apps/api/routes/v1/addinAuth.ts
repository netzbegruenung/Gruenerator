/**
 * Zwei Wege zum selben Endpunkt: Zugangsschlüssel oder OAuth-Token.
 *
 * Der Schlüssel (`gru_…`) bleibt, weil er für Skripte und für die Ausgabe von
 * Hand an einen kleinen Kreis der kürzeste Weg ist. Das OAuth-Token kommt
 * dazu, weil es drei Dinge löst, die der Schlüssel offen lässt: es hängt an
 * einem Konto, es lässt sich ohne Datenbankzugriff zurückziehen, und es läuft
 * von selbst ab.
 *
 * Das Muster ist nicht neu — `routes/mcp-server/mcpAuth.ts` macht seit dem
 * MCP-Server genau dasselbe und ist in Produktion. Hier steht es noch einmal,
 * weil die Zielform eine andere ist: der MCP-Pfad baut einen eigenen Kontext,
 * dieser hier füllt `req.apiKey`, damit `apiKeyRateLimit` und `assertScope`
 * unverändert weiterlaufen.
 *
 * Die Begrenzung greift beim OAuth-Weg pro **Konto** (`oauth:<userId>`), nicht
 * pro Token: sonst umginge man sie durch wiederholtes Anmelden.
 */

import { fromNodeHeaders } from 'better-auth/node';

import {
  extractBearer,
  verifyApiKey,
  type ApiKeyContext,
} from '../../middleware/apiKeyMiddleware.js';
import { createLogger } from '../../utils/logger.js';

import type { Request, Response, NextFunction } from 'express';

const log = createLogger('v1.addinAuth');

const REJECTION_MESSAGES: Record<'invalid' | 'revoked' | 'expired', string> = {
  invalid: 'Invalid API key',
  revoked: 'API key revoked',
  expired: 'API key expired',
};

/** Baut aus einer OAuth-Sitzung denselben Kontext, den ein Schlüssel liefert. */
export function contextFromOAuthSession(userId: string, rawScopes: string | null): ApiKeyContext {
  // `*` wird ausgefiltert, nicht nur „nicht vergeben": `assertScope` behandelt
  // es als Freibrief für jeden Scope. Unser Server stellt es heute nicht aus —
  // aber die Prüfung hängt dann daran, dass das so bleibt, und das ist eine
  // Zusicherung, die dieses Modul nicht geben kann.
  const permissions = String(rawScopes ?? '')
    .split(' ')
    .filter((scope) => scope.length > 0 && scope !== '*');

  return {
    // Ein OAuth-Token bekommt genau die Scopes, die die Nutzerin freigegeben
    // hat. Die Abkürzung, die es für Schlüssel gibt, wäre hier eine stille
    // Ausweitung.
    id: `oauth:${userId}`,
    userId,
    scopes: { permissions },
    rateLimitPerMinute: null,
  };
}

export async function requireAddinAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const bearer = extractBearer(req);
  if (!bearer) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
    return;
  }

  // `gru_` ist der Präfix, den `mintApiKey` vergibt — ein sicheres Zeichen für
  // einen Schlüssel. Dann sofort dorthin und gar nicht erst OAuth versuchen.
  if (bearer.startsWith('gru_')) {
    try {
      const result = await verifyApiKey(bearer);
      if (!result.ok) {
        res.status(401).json({ error: REJECTION_MESSAGES[result.reason] });
        return;
      }
      req.apiKey = result.ctx;
      next();
      return;
    } catch (err) {
      log.error('api-key verification failed: %s', err);
      res.status(503).json({ error: 'Authentication backend unavailable' });
      return;
    }
  }

  try {
    // Erst hier geladen, nicht oben im Modul: `config/betterAuth.js` baut beim
    // Import einen Postgres-Pool auf und löst Keycloak-URLs auf. Statisch
    // importiert hinge dieser Endpunkt — und jeder Test, der ihn anfasst — an
    // einer vollständigen Auth-Umgebung, obwohl der Schlüsselpfad davon nichts
    // braucht. Nach dem ersten Aufruf ist das Modul zwischengespeichert.
    const { auth } = await import('../../config/betterAuth.js');
    const session = await auth.api.getMcpSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.userId) {
      req.apiKey = contextFromOAuthSession(session.userId, session.scopes ?? null);
      next();
      return;
    }
  } catch (err) {
    log.warn('getMcpSession failed: %s', err);
  }

  // Rückfall auf den Schlüsselpfad, obwohl der Präfix fehlt.
  //
  // Der Endpunkt hat nie einen Präfix verlangt — `requireApiKey` schlägt jeden
  // Bearer in der Datenbank nach. Diesen Vertrag hier stillschweigend zu
  // verengen würde Schlüssel ungültig machen, die heute funktionieren, und
  // zwar unter der Überschrift „OAuth ergänzt". Die Reihenfolge ist bewusst
  // OAuth zuerst: das ist ab jetzt der übliche Fall ohne Präfix, und er soll
  // ohne zusätzlichen Datenbankzugriff auskommen.
  try {
    const result = await verifyApiKey(bearer);
    if (result.ok) {
      req.apiKey = result.ctx;
      next();
      return;
    }
    if (result.reason !== 'invalid') {
      res.status(401).json({ error: REJECTION_MESSAGES[result.reason] });
      return;
    }
  } catch (err) {
    log.error('api-key fallback verification failed: %s', err);
    res.status(503).json({ error: 'Authentication backend unavailable' });
    return;
  }

  // WWW-Authenticate zeigt OAuth-Clients, wo sie sich einen Token holen —
  // ohne den Header raten sie, und der Add-in-Ablauf hätte keinen Einstieg.
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${req.protocol}://${req.get('host') ?? ''}/.well-known/oauth-protected-resource"`
  );
  res.status(401).json({ error: 'Invalid or expired token' });
}
