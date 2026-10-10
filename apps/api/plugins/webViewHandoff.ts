/**
 * WebView session handoff — hands the mobile app's Bearer session to an
 * embedded WebView as a real browser cookie.
 *
 * Why this exists: `apps/mobile` does NOT use `@better-auth/expo`. It holds an
 * opaque Better Auth session token in `expo-secure-store` and sends it as
 * `Authorization: Bearer` (see `packages/shared/src/api/client.ts`). A WebView
 * has its own cookie store and knows nothing about that header beyond the
 * initial top-level request, so an embedded web page would load logged out.
 * There is no cookie value on the app side to copy across — the only workable
 * shape is to exchange the Bearer for a fresh, server-issued session cookie.
 *
 * Two-step (preferred, used by new clients):
 *   1. POST /web-handoff/mint   — Bearer auth, returns a 60s single-use token.
 *   2. GET  /web-handoff?ott=…&redirect=/pfad — sets the cookie, 302s onward.
 * The split exists because a WebView only attaches `source.headers` to the
 * *initial* top-level request; a query parameter does not depend on that
 * platform behaviour at all.
 *
 * One-step (legacy, must keep working):
 *   GET /web-handoff?redirect=/pfad with an `Authorization: Bearer` header.
 * Already-shipped mobile binaries call exactly this (`web-viewer.tsx`), and it
 * has been 404ing because the endpoint never existed. Dropping the path would
 * leave every installed app broken until users update.
 *
 * The cookie is First-Party: the API is served from `gruenerator.eu/api` and
 * `crossSubDomainCookies.domain` is `.gruenerator.eu` in production, so the
 * cookie Better Auth sets here is the same one a normal web login produces.
 *
 * Redirect validation lives in `./webViewHandoffRedirect.ts` — see the header
 * there for why it is the security boundary of this flow.
 */

import { randomUUID } from 'crypto';

import { APIError, createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { captureAuthIssue } from '../utils/observability/captureAuthIssue.js';
import redisClient from '../utils/redis/client.js';

import { validateRedirectTarget } from './webViewHandoffRedirect.js';

import type { BetterAuthPlugin } from 'better-auth';

const log = createLogger('webViewHandoff');

// Same signing key as the app-login code (`routes/auth/appLogin.ts`), but a
// DIFFERENT audience — reusing that audience would make the two token kinds
// interchangeable, so a captured login code could be redeemed here and vice
// versa.
const HANDOFF_SECRET = new TextEncoder().encode(
  env.SESSION_SECRET ?? 'fallback-secret-please-change'
);
const HANDOFF_ISSUER = 'gruenerator-auth';
const HANDOFF_AUDIENCE = 'gruenerator-webview-handoff';
const HANDOFF_TOKEN_USE = 'webview_handoff';
const HANDOFF_TTL_SECONDS = 60;
const HANDOFF_REDIS_PREFIX = 'webview-handoff:';
const HANDOFF_SESSIONS_REDIS_PREFIX = 'webview-handoff-sessions:';

/** Shape returned by `POST /web-handoff/mint`; the mobile client parses it. */
export const webViewHandoffMintResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number(),
});

export type WebViewHandoffMintResponse = z.infer<typeof webViewHandoffMintResponseSchema>;

const handoffQuerySchema = z.object({
  redirect: z.string(),
  ott: z.string().optional(),
});

const handoffClaimsSchema = z.object({
  token_use: z.literal(HANDOFF_TOKEN_USE),
  sub: z.string().min(1),
  jti: z.string().min(1),
  // Optional: tokens minted before this claim existed are still valid for
  // their 60s lifetime; their web session just goes unrecorded.
  sid: z.string().min(1).optional(),
});

interface HandoffGrant {
  userId: string;
  bearerSessionId: string | null;
}

/**
 * Remembers which web sessions a mobile Bearer session handed off, so that
 * mobile logout can revoke exactly those (`revokeHandoffSessions`) and leave
 * the user's other devices alone. Bookkeeping only: a Redis failure here must
 * not fail the handoff.
 */
async function recordHandoffSession(
  bearerSessionId: string,
  webSession: { token: string; expiresAt: Date }
): Promise<void> {
  const key = `${HANDOFF_SESSIONS_REDIS_PREFIX}${bearerSessionId}`;
  try {
    await redisClient
      .multi()
      .sAdd(key, webSession.token)
      .expireAt(key, Math.ceil(webSession.expiresAt.getTime() / 1000))
      .exec();
  } catch (err) {
    log.warn('[WebViewHandoff] Could not record handoff session: %s', (err as Error).message);
  }
}

/**
 * Revokes every web session handed off from the given mobile Bearer session.
 * Goes through Better Auth's `deleteSession` so the secondary-storage cache
 * entry dies together with the `ba_sessions` row.
 */
export async function revokeHandoffSessions(
  internalAdapter: { deleteSession: (token: string) => Promise<unknown> },
  bearerSessionId: string
): Promise<number> {
  const key = `${HANDOFF_SESSIONS_REDIS_PREFIX}${bearerSessionId}`;
  const tokens = await redisClient.sMembers(key);
  await Promise.all(tokens.map((token) => internalAdapter.deleteSession(token)));
  await redisClient.del(key);
  return tokens.length;
}

/**
 * Redeems a one-time token: verifies the signature, then atomically consumes
 * the Redis entry so a replay of the same JWT finds nothing.
 *
 * Returns the grant (user + minting Bearer session), or null for anything
 * invalid — the caller must not distinguish the failure modes to the client.
 */
async function consumeHandoffToken(token: string): Promise<HandoffGrant | null> {
  let claims: z.infer<typeof handoffClaimsSchema>;
  try {
    const verified = await jwtVerify(token, HANDOFF_SECRET, {
      issuer: HANDOFF_ISSUER,
      audience: HANDOFF_AUDIENCE,
    });
    claims = handoffClaimsSchema.parse(verified.payload);
  } catch (err) {
    log.warn('[WebViewHandoff] Invalid or expired handoff token: %s', (err as Error).message);
    return null;
  }

  // `getDel` is the single-use gate. The signature alone would let the same
  // token be redeemed repeatedly for its full 60s lifetime.
  const storedUserId = await redisClient.getDel(`${HANDOFF_REDIS_PREFIX}${claims.jti}`);
  if (storedUserId == null) {
    log.warn('[WebViewHandoff] Handoff token already used or expired (jti consumed)');
    return null;
  }
  if (storedUserId !== claims.sub) {
    // Signature and store disagree — treat as tampering, not as a stale entry.
    log.error('[WebViewHandoff] Handoff token subject mismatch');
    captureAuthIssue({
      stage: 'token-exchange',
      cause: new Error('webview handoff subject mismatch'),
      extras: { path: 'web-handoff' },
    });
    return null;
  }

  return { userId: storedUserId, bearerSessionId: claims.sid ?? null };
}

export const webViewHandoff = () => {
  return {
    id: 'webview-handoff',
    endpoints: {
      // POST /api/auth/v2/web-handoff/mint
      webHandoffMint: createAuthEndpoint(
        '/web-handoff/mint',
        {
          method: 'POST',
          // No body schema: the caller is identified purely by its session.
          requireHeaders: true,
        },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session?.user) {
            throw new APIError('UNAUTHORIZED', { message: 'Session required' });
          }

          const jti = randomUUID();
          await redisClient.setEx(
            `${HANDOFF_REDIS_PREFIX}${jti}`,
            HANDOFF_TTL_SECONDS,
            session.user.id
          );

          const token = await new SignJWT({
            token_use: HANDOFF_TOKEN_USE,
            sub: session.user.id,
            jti,
            sid: session.session.id,
          })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime(`${HANDOFF_TTL_SECONDS}s`)
            .setIssuer(HANDOFF_ISSUER)
            .setAudience(HANDOFF_AUDIENCE)
            .sign(HANDOFF_SECRET);

          // Never log the token itself — only that one was issued.
          log.info('[WebViewHandoff] Handoff token minted: user_id=%s', session.user.id);

          return ctx.json({
            token,
            expiresIn: HANDOFF_TTL_SECONDS,
          } satisfies WebViewHandoffMintResponse);
        }
      ),

      // GET /api/auth/v2/web-handoff?redirect=/pfad[&ott=…]
      webHandoff: createAuthEndpoint(
        '/web-handoff',
        {
          method: 'GET',
          query: handoffQuerySchema,
          requireHeaders: true,
        },
        async (ctx) => {
          const target = validateRedirectTarget(ctx.query.redirect);
          if (!target.ok) {
            // Log the reason, never the raw value — it is attacker-controlled.
            log.warn('[WebViewHandoff] Rejected redirect target: reason=%s', target.reason);
            throw new APIError('BAD_REQUEST', { message: 'Invalid redirect target' });
          }

          let grant: HandoffGrant | null;
          if (ctx.query.ott != null) {
            grant = await consumeHandoffToken(ctx.query.ott);
          } else {
            // Legacy single-step path for already-shipped mobile binaries.
            const bearerSession = await getSessionFromCtx(ctx);
            grant = bearerSession?.user
              ? { userId: bearerSession.user.id, bearerSessionId: bearerSession.session.id }
              : null;
            if (grant != null) {
              log.info(
                '[WebViewHandoff] Legacy header-authenticated handoff: user_id=%s',
                grant.userId
              );
            }
          }

          if (grant == null) {
            throw new APIError('UNAUTHORIZED', { message: 'Handoff is invalid or expired' });
          }
          const { userId } = grant;

          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (!user) {
            log.error('[WebViewHandoff] User not found for handoff: id=%s', userId);
            throw new APIError('UNAUTHORIZED', { message: 'Handoff is invalid or expired' });
          }

          // A fresh session rather than a reuse of the Bearer one: the cookie
          // and the app token then expire and can be revoked independently.
          // Consequence, accepted deliberately (same as `token-exchange-code`):
          // every handoff adds a row to `ba_sessions`.
          const session = await ctx.context.internalAdapter.createSession(userId, false);
          if (grant.bearerSessionId != null) {
            await recordHandoffSession(grant.bearerSessionId, session);
          }

          await setSessionCookie(ctx, { session, user });

          log.info('[WebViewHandoff] Session cookie issued: user_id=%s', userId);

          return ctx.redirect(target.path);
        }
      ),
    },
  } satisfies BetterAuthPlugin;
};
