/**
 * Zugriffstoken am Ressourcenserver prüfen — der Ersatz für `getMcpSession`.
 *
 * better-auth 1.7 hat `auth.api.getMcpSession()` ersatzlos gestrichen, weil
 * sich das Tokenmodell geändert hat: 1.6 stellte ein opakes Token aus und
 * schlug es in `ba_oauth_access_tokens` nach, 1.7 stellt mit dem `jwt()`-Plugin
 * ein signiertes JWT aus, das der Ressourcenserver gegen die JWKS des
 * Autorisierungsservers prüft — ohne Datenbankzeile.
 *
 * `verifyAccessTokenRequest` (statt `verifyBearerToken`) prüft nicht nur das
 * Token, sondern die ganze Anfrage: Methode, URL, Authorization-Schema und, bei
 * sender-gebundenen Token, den DPoP-Nachweis samt `ath`- und `cnf.jkt`-Bindung.
 * Wir stellen heute keine DPoP-Token aus; der Weg kostet nichts und ist der
 * einzige, bei dem eine spätere DPoP-Ausstellung nicht still ungeprüft bliebe.
 */

import { createLogger } from '../../utils/logger.js';

import type { Request } from 'express';

const log = createLogger('OAuthResource');

export interface OAuthResourceClaims {
  userId: string;
  scopes: Set<string>;
  /** `client_id` des Tokens, für Protokollierung — nicht für Berechtigungen. */
  clientId: string | null;
}

interface ResourceRequestInput {
  authorizationHeader: string | null | undefined;
  dpopProofJwt?: string | null | undefined;
  method: string;
  url: string;
}

interface ResourceClientActions {
  verifyAccessTokenRequest: (request: ResourceRequestInput) => Promise<Record<string, unknown>>;
}

let actions: Promise<ResourceClientActions> | null = null;

/**
 * `config/betterAuth.js` baut beim Import einen Postgres-Pool auf und löst
 * Keycloak-URLs auf. Statisch importiert hinge jeder Aufrufer — und jeder Test,
 * der ihn anfasst — an einer vollständigen Auth-Umgebung. Deshalb erst beim
 * ersten Aufruf laden und danach festhalten.
 */
async function loadActions(): Promise<ResourceClientActions> {
  const [{ oauthProviderResourceClient }, { auth }] = await Promise.all([
    import('@better-auth/oauth-provider/resource-client'),
    import('../../config/betterAuth.js'),
  ]);
  return oauthProviderResourceClient(auth).getActions() as unknown as ResourceClientActions;
}

function getActions(): Promise<ResourceClientActions> {
  // Der Merker darf nur einen ERFOLGREICHEN Ladevorgang festhalten. Ein
  // abgelehntes Promise stehen zu lassen hiesse: ein einziger vorübergehender
  // Fehler beim Laden legt den OAuth-Weg für die Lebensdauer des Prozesses
  // still, und zwar lautlos — jeder weitere Aufruf bekäme dieselbe alte
  // Ablehnung zurück, ohne es noch einmal zu versuchen.
  actions ??= loadActions().catch((err: unknown) => {
    actions = null;
    throw err;
  });
  return actions;
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Prüft das Bearer-Token der Anfrage. Gibt `null` zurück, wenn es fehlt,
 * abgelaufen, für eine andere Ressource ausgestellt oder anderweitig ungültig
 * ist — der Aufrufer entscheidet, ob er darauf einen anderen Weg probiert.
 */
export async function verifyOAuthResourceRequest(
  req: Request
): Promise<OAuthResourceClaims | null> {
  try {
    const { verifyAccessTokenRequest } = await getActions();
    // Hinter dem Reverse-Proxy trägt Express das ursprüngliche Schema und den
    // Host nur, weil `trust proxy` gesetzt ist; ohne das stünde hier `http` und
    // die Container-Adresse. Für die reine Bearer-Prüfung ist die URL
    // unerheblich, für eine spätere DPoP-`htu`-Bindung wäre sie es nicht.
    const payload = await verifyAccessTokenRequest({
      authorizationHeader: firstHeader(req.headers.authorization),
      dpopProofJwt: firstHeader(req.headers.dpop),
      method: req.method,
      url: `${req.protocol}://${req.get('host') ?? ''}${req.originalUrl}`,
    });

    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      log.warn('access token ohne sub-claim abgewiesen');
      return null;
    }

    const rawScope = payload.scope;
    const scopes = new Set(typeof rawScope === 'string' ? rawScope.split(' ').filter(Boolean) : []);
    const clientId = typeof payload.client_id === 'string' ? payload.client_id : null;

    return { userId: sub, scopes, clientId };
  } catch (err) {
    // Ein ungültiges Token ist der Normalfall, kein Zwischenfall: abgelaufen,
    // widerrufen, für eine andere Ressource ausgestellt oder schlicht ein
    // API-Schlüssel ohne Präfix. Debug-Stufe, damit der Fehlerkanal frei bleibt.
    log.debug(`access token nicht verifizierbar: ${(err as Error).message}`);
    return null;
  }
}
