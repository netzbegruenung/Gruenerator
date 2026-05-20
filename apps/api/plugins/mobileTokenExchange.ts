import { createAuthEndpoint } from 'better-auth/api';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { captureAuthIssue } from '../utils/observability/captureAuthIssue.js';

import type { BetterAuthPlugin } from 'better-auth';

// Matches the signing key used by `appLogin.ts` when it mints the short-lived
// login-code after a successful OAuth callback. The code is passed through
// the custom scheme (`gruenerator://auth/callback?code=…`) and exchanged
// here for a Better Auth session token.
const LOGIN_CODE_SECRET = new TextEncoder().encode(
  env.SESSION_SECRET ?? 'fallback-secret-please-change'
);

const log = createLogger('mobileTokenExchange');

interface KeycloakPayload {
  email?: string;
  name?: string;
  preferred_username?: string;
  email_verified?: boolean;
  sub?: string;
}

const KC_ISSUER = `${env.KEYCLOAK_BASE_URL}/realms/${env.KEYCLOAK_REALM}`;
const JWKS = createRemoteJWKSet(new URL(`${KC_ISSUER}/protocol/openid-connect/certs`));

const LOCALE_MAP: Record<string, 'de-DE' | 'de-AT'> = {
  'gruene-oesterreich-login': 'de-AT',
};

export const mobileTokenExchange = () => {
  return {
    id: 'mobile-token-exchange',
    endpoints: {
      tokenExchange: createAuthEndpoint(
        '/token-exchange',
        {
          method: 'POST',
          requireHeaders: false,
        },
        async (ctx) => {
          const { idToken, authSource } = ctx.body as {
            idToken: string;
            authSource?: string;
          };

          if (!idToken) {
            log.warn('[TokenExchange] Request missing idToken');
            throw new Error('idToken is required');
          }

          let payload: KeycloakPayload;
          try {
            const verified = await jwtVerify<KeycloakPayload>(idToken, JWKS, {
              issuer: KC_ISSUER,
            });
            payload = verified.payload;
          } catch (err) {
            log.error(
              '[TokenExchange] JWT verification failed (issuer=%s, authSource=%s): %s',
              KC_ISSUER,
              authSource ?? 'unknown',
              (err as Error).message
            );
            captureAuthIssue({
              stage: 'token-exchange',
              cause: err,
              extras: { issuer: KC_ISSUER, authSource: authSource ?? 'unknown', path: 'idToken' },
            });
            throw err;
          }

          const email = payload.email;
          if (!email) {
            log.warn(
              '[TokenExchange] Token missing email claim (sub=%s, authSource=%s)',
              payload.sub ?? 'none',
              authSource ?? 'unknown'
            );
            throw new Error('Token missing email claim');
          }

          const locale = LOCALE_MAP[authSource || ''] || 'de-DE';
          const name = payload.name || payload.preferred_username || email.split('@')[0];

          const existing = await ctx.context.internalAdapter.findUserByEmail(email);

          let userData: { id: string; [key: string]: unknown };
          if (existing) {
            log.info(
              '[TokenExchange] Reusing existing user: email=%s, id=%s',
              email,
              existing.user.id
            );
            userData = existing.user as typeof userData;
          } else {
            log.info(
              '[TokenExchange] Creating new user via mobile flow: email=%s, authSource=%s, keycloak_sub=%s',
              email,
              authSource ?? 'unknown',
              payload.sub ?? 'none'
            );
            const created = await ctx.context.internalAdapter.createUser({
              email,
              name,
              emailVerified: payload.email_verified ?? false,
              locale,
              auth_source: authSource || 'mobile',
              keycloak_id: payload.sub || null,
            });
            userData = (created as unknown as { user: typeof userData }).user;
          }

          const session = await ctx.context.internalAdapter.createSession(userData.id, false);
          log.info(
            '[TokenExchange] Session issued: user_id=%s, token_prefix=%s...',
            userData.id,
            session.token?.slice(0, 8) ?? 'NONE'
          );

          return ctx.json({
            token: session.token,
            user: userData,
            expiresAt: session.expiresAt,
          });
        }
      ),

      // POST /token-exchange-code
      //
      // Exchanges the short-lived login-code JWT (minted in appLogin.ts after
      // a browser-based OAuth callback) for a Better Auth session token. The
      // mobile client stores the returned `token` in secure storage and sends
      // it as `Authorization: Bearer <token>` on every request — the `bearer`
      // plugin then teaches `auth.api.getSession({ headers })` to resolve it
      // so our shared `requireAuth` middleware works unchanged for both web
      // cookies and mobile Bearer tokens.
      //
      // Replaces the legacy `/auth/mobile/consume-login-code` Express route,
      // which minted a custom HS256 JWT that Better Auth never recognised.
      tokenExchangeCode: createAuthEndpoint(
        '/token-exchange-code',
        {
          method: 'POST',
          requireHeaders: false,
        },
        async (ctx) => {
          const { code } = ctx.body as { code?: string };
          if (!code) {
            log.warn('[TokenExchangeCode] Request missing code');
            throw new Error('code is required');
          }

          let payload: { sub?: string; token_use?: string };
          try {
            const verified = await jwtVerify<{ sub?: string; token_use?: string }>(
              code,
              LOGIN_CODE_SECRET,
              {
                issuer: 'gruenerator-auth',
                audience: 'gruenerator-app-login-code',
              }
            );
            payload = verified.payload;
          } catch (err) {
            log.warn(
              '[TokenExchangeCode] Invalid or expired login code: %s',
              (err as Error).message
            );
            // Suppression for expired/replayed codes happens inside
            // `captureAuthIssue` via the benign-message regex; genuine
            // tampering (bad signature, wrong audience/issuer) still
            // surfaces.
            captureAuthIssue({
              stage: 'token-exchange',
              cause: err,
              extras: { path: 'login-code' },
            });
            throw new Error('Login code is invalid or expired');
          }

          if (payload.token_use !== 'app_login_code' || !payload.sub) {
            log.warn('[TokenExchangeCode] Invalid token payload: %o', payload);
            throw new Error('Invalid token payload');
          }

          const userId = payload.sub;
          const existing = await ctx.context.internalAdapter.findUserById(userId);
          if (!existing) {
            log.error('[TokenExchangeCode] User not found for login code: id=%s', userId);
            throw new Error('User account not found');
          }

          const session = await ctx.context.internalAdapter.createSession(userId, false);
          log.info(
            '[TokenExchangeCode] Session issued: user_id=%s, token_prefix=%s...',
            userId,
            session.token?.slice(0, 8) ?? 'NONE'
          );

          return ctx.json({
            token: session.token,
            user: existing,
            expiresAt: session.expiresAt,
          });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
};
