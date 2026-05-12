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

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1].trim() : null;
}

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

  const hash = hashApiKey(plaintext);
  const db = getDrizzleInstance();

  let row;
  try {
    const rows = await db.select().from(api_keys).where(eq(api_keys.key_hash, hash)).limit(1);
    row = rows[0];
  } catch (err) {
    log.error('[apiKey] DB lookup failed:', { error: err });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  if (!row) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  if (row.revoked_at) {
    res.status(401).json({ error: 'API key revoked' });
    return;
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    res.status(401).json({ error: 'API key expired' });
    return;
  }

  req.apiKey = {
    id: row.id,
    userId: row.user_id,
    scopes: row.scopes ?? {},
    rateLimitPerMinute: row.rate_limit_per_minute,
  };

  // Fire-and-forget last_used_at touch — never block the request.
  db.update(api_keys)
    .set({ last_used_at: new Date() })
    .where(eq(api_keys.id, row.id))
    .catch((err) => log.warn('[apiKey] last_used_at update failed:', err));

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
