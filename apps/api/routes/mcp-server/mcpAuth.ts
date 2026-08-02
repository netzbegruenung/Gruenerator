import { fromNodeHeaders } from 'better-auth/node';

import { auth } from '../../config/betterAuth.js';
import { MCP_SCOPES } from '../../config/mcpServer.js';
import { extractBearer, verifyApiKey } from '../../middleware/apiKeyMiddleware.js';
import { createLogger } from '../../utils/logger.js';

import type { Request } from 'express';

const log = createLogger('McpServerAuth');

export interface McpAuthContext {
  userId: string;
  scopes: Set<string>;
  via: 'oauth' | 'api-key';
  /**
   * Nur beim Schlüssel-Weg gefüllt: eine OAuth-Sitzung kennt weder einen
   * Landesverband noch ein Kontingent pro Schlüssel.
   */
  apiKey?: {
    id: string;
    landesverbaende: string[] | '*' | undefined;
    rateLimitPerMinute: number | null;
  };
}

/**
 * Was eine `api_keys`-Berechtigung am MCP-Endpunkt öffnet.
 *
 * `permissions` und `MCP_SCOPES` sind zwei getrennte Mengen mit leerem Schnitt:
 * vergeben werden `notebooks:read` und `chat:completions`, geprüft wurde gegen
 * `search`, `content:read`, … Der Filter darunter ergab deshalb für jeden
 * existierenden Schlüssel die leere Menge — die Anmeldung gelang, und übrig
 * blieb `whoami` mit „Scopes: (keine)". Kein Fehler, keine Meldung.
 *
 * `notebooks:read` öffnet `search`, weil der Programmkorpus dahinter derselbe
 * ist, den der alte MCP-Server ohne jede Anmeldung ausgeliefert hat. Die
 * Landesverbands-Werkzeuge hängen NICHT hier, sondern an
 * `scopes.landesverbaende` — siehe `landesverbandTools.ts`.
 */
const API_KEY_PERMISSION_SCOPES: Record<string, readonly string[]> = {
  'notebooks:read': ['search'],
};

/**
 * `gru_`-prefixed bearers are api_keys PATs (DCR+PKCE is impractical from
 * cron/scripts); `*` grants all. Everything else is a Better Auth OAuth access
 * token.
 */
export async function resolveMcpAuth(req: Request): Promise<McpAuthContext | null> {
  const bearer = extractBearer(req);
  if (!bearer) return null;

  if (bearer.startsWith('gru_')) {
    try {
      const result = await verifyApiKey(bearer);
      if (!result.ok) return null;
      const perms = result.ctx.scopes.permissions ?? [];
      const scopes = perms.includes('*')
        ? new Set<string>(MCP_SCOPES)
        : new Set<string>(
            perms.flatMap((p) =>
              // Ein Schlüssel darf einen MCP-Scope auch direkt tragen — die
              // Zuordnung oben kommt nur für die Berechtigungen dazu, die
              // anders heissen.
              (MCP_SCOPES as readonly string[]).includes(p)
                ? [p]
                : [...(API_KEY_PERMISSION_SCOPES[p] ?? [])]
            )
          );
      return {
        userId: result.ctx.userId,
        scopes,
        via: 'api-key',
        apiKey: {
          id: result.ctx.id,
          landesverbaende: result.ctx.scopes.landesverbaende,
          rateLimitPerMinute: result.ctx.rateLimitPerMinute,
        },
      };
    } catch (err) {
      log.error('api-key verification failed: %s', err);
      return null;
    }
  }

  try {
    const session = await auth.api.getMcpSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.userId) {
      const scopes = new Set(
        String(session.scopes ?? '')
          .split(' ')
          .filter(Boolean)
      );
      return { userId: session.userId, scopes, via: 'oauth' };
    }
  } catch (err) {
    log.warn('getMcpSession failed: %s', err);
  }

  return null;
}
