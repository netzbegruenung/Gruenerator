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
}

/**
 * `gru_`-prefixed bearers are api_keys PATs (DCR+PKCE is impractical from
 * cron/scripts); their scopes map onto MCP scopes literally, `*` grants all.
 * Everything else is a Better Auth OAuth access token.
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
        : new Set(perms.filter((p) => (MCP_SCOPES as readonly string[]).includes(p)));
      return { userId: result.ctx.userId, scopes, via: 'api-key' };
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
