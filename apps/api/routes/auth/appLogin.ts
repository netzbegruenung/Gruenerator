/**
 * App Login Routes — OAuth entry point for mobile & desktop apps
 *
 * Replaces the old Passport.js-based GET /auth/login + GET /auth/callback
 * with Better Auth equivalents. The flow:
 *
 * 1. GET /auth/login?source=<source>&redirectTo=gruenerator://auth/callback
 *    → maps source to Better Auth providerId
 *    → stores redirectTo in Redis
 *    → calls Better Auth to get Keycloak authorization URL
 *    → 302 redirects the system browser to Keycloak
 *
 * 2. After Keycloak auth, Better Auth's callback processes the OAuth code,
 *    then redirects to GET /auth/app-callback?state=<nonce>
 *
 * 3. GET /auth/app-callback
 *    → reads session (set by Better Auth during callback)
 *    → retrieves redirectTo from Redis
 *    → generates a short-lived login code JWT
 *    → 302 redirects to gruenerator://auth/callback?code=<jwt>
 *
 * 4. The app's deep-link handler receives the code and exchanges it
 *    via POST /auth/mobile/consume-login-code for access + refresh tokens.
 */

import { randomBytes } from 'crypto';

import { fromNodeHeaders } from 'better-auth/node';
import express, { type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { SignJWT } from 'jose';

import { auth } from '../../config/betterAuth.js';
import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { parseJSON } from '../../utils/parseJSON.js';
import redisClient from '../../utils/redis/client.js';

import type { AuthRequest } from './types.js';

// App login state stored in Redis with a longer TTL than bridge codes
// (users need time to authenticate with Keycloak)
const APP_LOGIN_PREFIX = 'app-login:state:';
const APP_LOGIN_TTL_SECONDS = 300; // 5 minutes

interface AppLoginState {
  redirectTo: string;
}

async function storeAppLoginState(nonce: string, state: AppLoginState): Promise<void> {
  await redisClient.setEx(
    `${APP_LOGIN_PREFIX}${nonce}`,
    APP_LOGIN_TTL_SECONDS,
    JSON.stringify(state)
  );
}

async function consumeAppLoginState(nonce: string): Promise<AppLoginState | null> {
  const key = `${APP_LOGIN_PREFIX}${nonce}`;
  const raw = await redisClient.getDel(key);
  if (!raw) return null;
  return parseJSON<AppLoginState>(raw);
}

const log = createLogger('appLogin');
const router = express.Router();

const loginLimiter = env.DISABLE_RATE_LIMITS
  ? (_req: AuthRequest, _res: Response, next: () => void) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many login attempts, please try again later.' },
    });

const JWT_SECRET = new TextEncoder().encode(env.SESSION_SECRET ?? 'fallback-secret-please-change');

const SOURCE_TO_PROVIDER: Record<string, string> = {
  'gruenerator-login': 'keycloak-gruenerator',
  'gruenes-netz-login': 'keycloak-gruenes-netz',
  'netzbegruenung-login': 'keycloak-netzbegruenung',
  'gruene-oesterreich-login': 'keycloak-gruene-at',
};

function isAllowedAppRedirect(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
  return lower.startsWith('gruenerator://') || lower.startsWith('gruenerator-docs://');
}

function appendQueryParam(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

// ============================================================================
// GET /auth/login — entry point for mobile/desktop OAuth
// ============================================================================

router.get('/login', loginLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const source = (req.query.source as string) || 'gruenerator-login';
  const redirectTo = req.query.redirectTo as string | undefined;

  const providerId = SOURCE_TO_PROVIDER[source];
  if (!providerId) {
    log.warn('[AppLogin] Unknown source:', source);
    res.status(400).json({ error: 'Unknown login source' });
    return;
  }

  if (redirectTo && !isAllowedAppRedirect(redirectTo)) {
    log.warn('[AppLogin] Disallowed redirectTo:', redirectTo);
    res.status(400).json({ error: 'Invalid redirect URL' });
    return;
  }

  try {
    const stateNonce = randomBytes(16).toString('base64url');

    if (redirectTo) {
      await storeAppLoginState(stateNonce, { redirectTo });
    }

    const callbackURL = redirectTo ? `/api/auth/app-callback?state=${stateNonce}` : '/desk';

    log.info(
      '[AppLogin] Initiating OAuth: source=%s, providerId=%s, callbackURL=%s, redirectTo=%s',
      source,
      providerId,
      callbackURL,
      redirectTo ?? 'none'
    );

    const response = await auth.api.signInWithOAuth2({
      body: {
        providerId,
        callbackURL,
      },
    });

    const url = (response as { url?: string }).url;
    if (!url) {
      log.error(
        '[AppLogin] No URL returned from Better Auth signInWithOAuth2 (provider=%s, callbackURL=%s)',
        providerId,
        callbackURL
      );
      res.status(500).json({ error: 'Failed to initiate OAuth flow' });
      return;
    }

    log.info(
      '[AppLogin] OAuth provider URL: %s (source=%s, providerId=%s)',
      url,
      source,
      providerId
    );
    res.redirect(url);
  } catch (error) {
    log.error('[AppLogin] Error initiating OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate login' });
  }
});

// ============================================================================
// GET /auth/app-callback — receives redirect after Better Auth OAuth callback
// ============================================================================

router.get('/app-callback', async (req: AuthRequest, res: Response): Promise<void> => {
  const stateNonce = req.query.state as string | undefined;

  if (!stateNonce) {
    log.warn('[AppCallback] Missing state parameter');
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  try {
    const loginState = await consumeAppLoginState(stateNonce);
    if (!loginState) {
      log.warn('[AppCallback] Invalid or expired state nonce');
      res.status(400).json({ error: 'Invalid or expired state' });
      return;
    }

    const { redirectTo } = loginState;

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      log.error('[AppCallback] No session found after OAuth callback');
      const errorRedirect = appendQueryParam(redirectTo, 'error', 'no_session');
      res.redirect(errorRedirect);
      return;
    }

    const { randomUUID } = await import('crypto');
    const jti = randomUUID();

    const code = await new SignJWT({
      token_use: 'app_login_code',
      sub: session.user.id,
      jti,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('60s')
      .setIssuer('gruenerator-auth')
      .setAudience('gruenerator-app-login-code')
      .sign(JWT_SECRET);

    log.info('[AppCallback] Login code generated, redirecting to app', {
      userId: session.user.id,
    });

    const redirectWithCode = appendQueryParam(redirectTo, 'code', code);
    res.redirect(redirectWithCode);
  } catch (error) {
    log.error('[AppCallback] Error processing callback:', error);
    res.status(500).json({ error: 'Failed to process callback' });
  }
});

export default router;
