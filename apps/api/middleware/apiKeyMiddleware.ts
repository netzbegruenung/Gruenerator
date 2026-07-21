import { createHash } from 'crypto';

import { eq } from 'drizzle-orm';

import { api_keys, type ApiKeyScopes } from '../database/schema/apiKeys.js';
import { getDrizzleInstance } from '../database/services/DrizzleService.js';
import { createLogger } from '../utils/logger.js';

import type { Request, Response, NextFunction } from 'express';

const log = createLogger('apiKey');

export interface ApiKeyContext {
  id: string;
  userId: string;
  scopes: ApiKeyScopes;
  rateLimitPerMinute: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
    }
  }
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1].trim() : null;
}

export type VerifyApiKeyResult =
  | { ok: true; ctx: ApiKeyContext }
  | { ok: false; reason: 'invalid' | 'revoked' | 'expired' };

/**
 * Verify a plaintext API key against the `api_keys` table.
 * Throws on DB failure. Shared by `requireApiKey` and the MCP server's
 * bearer fallback (routes/mcp-server).
 */
export async function verifyApiKey(plaintext: string): Promise<VerifyApiKeyResult> {
  const hash = hashApiKey(plaintext);
  const db = getDrizzleInstance();

  const rows = await db.select().from(api_keys).where(eq(api_keys.key_hash, hash)).limit(1);
  const row = rows[0];

  if (!row) return { ok: false, reason: 'invalid' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { ok: false, reason: 'expired' };
  }

  // Fire-and-forget last_used_at touch — never block the request.
  db.update(api_keys)
    .set({ last_used_at: new Date() })
    .where(eq(api_keys.id, row.id))
    .catch((err) => log.warn('[apiKey] last_used_at update failed:', err));

  return {
    ok: true,
    ctx: {
      id: row.id,
      userId: row.user_id,
      scopes: row.scopes ?? {},
      rateLimitPerMinute: row.rate_limit_per_minute,
    },
  };
}

const REJECTION_MESSAGES: Record<'invalid' | 'revoked' | 'expired', string> = {
  invalid: 'Invalid API key',
  revoked: 'API key revoked',
  expired: 'API key expired',
};

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const plaintext = extractBearer(req);
  if (!plaintext) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <api-key> header' });
    return;
  }

  let result: VerifyApiKeyResult;
  try {
    result = await verifyApiKey(plaintext);
  } catch (err) {
    log.error('[apiKey] DB lookup failed:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  if (!result.ok) {
    res.status(401).json({ error: REJECTION_MESSAGES[result.reason] });
    return;
  }

  req.apiKey = result.ctx;
  next();
}

export function assertLandesverbandAllowed(
  ctx: ApiKeyContext,
  requested: string
): { ok: true } | { ok: false; reason: string } {
  const allowed = ctx.scopes.landesverbaende;
  if (allowed === '*') return { ok: true };
  if (!allowed || allowed.length === 0) {
    return { ok: false, reason: 'API key has no Landesverband scope assigned' };
  }
  if (!allowed.includes(requested)) {
    return {
      ok: false,
      reason: `API key not authorized for Landesverband '${requested}' (allowed: ${allowed.join(', ')})`,
    };
  }
  return { ok: true };
}

export function assertScope(ctx: ApiKeyContext, required: string): boolean {
  const perms = ctx.scopes.permissions ?? [];
  return perms.includes(required) || perms.includes('*');
}
