import { createAuthEndpoint } from 'better-auth/api';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../config/env.js';
import { getAuthTokenSecret } from '../utils/authTokenSecret.js';
import { createLogger } from '../utils/logger.js';
import { captureAuthIssue } from '../utils/observability/captureAuthIssue.js';
import redisClient from '../utils/redis/client.js';

import type { BetterAuthPlugin } from 'better-auth';

// `appLogin.ts` mints the short-lived login code after a successful OAuth
// callback (signed with `getAuthTokenSecret`) and stores its `jti` under this
// prefix. The code is passed through the custom scheme
// (`gruenerator://auth/callback?code=…`) and exchanged here, once, for a
// Better Auth session token.
export const APP_LOGIN_CODE_REDIS_PREFIX = 'app-login:code:';
export const APP_LOGIN_CODE_TTL_SECONDS = 60;

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

// Spiegelt `PROVIDER_LOCALE` in `config/localeSync.ts`, hier auf die
// `authSource`-Namen bezogen. `gruenerator-login` fehlt bewusst: er trägt kein
// Ländersignal und wird derzeit nicht verwendet — für ihn bleibt das Profil
// leer, statt Deutschland zu unterstellen.
const LOCALE_MAP: Record<string, 'de-DE' | 'de-AT'> = {
  'gruene-oesterreich-login': 'de-AT',
  'gruenes-netz-login': 'de-DE',
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

          const locale = LOCALE_MAP[authSource || ''] ?? null;
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
            const created = await ctx.context.internalAdapter.createUser(
              {
                email,
                name,
                emailVerified: payload.email_verified ?? false,
                // Weglassen statt raten: nennt der Anmeldeweg kein Land, bleibt das
                // Feld leer und die Oberfläche fragt nach.
                ...(locale !== null && { locale }),
                auth_source: authSource || 'mobile',
                keycloak_id: payload.sub || null,
              },
              // Ab 1.7 verlangt `createUser` die Herkunft der Anlage: sie geht
              // in `user.validateUserInfo` und dessen Kontext. Wir kommen hier
              // aus einem gegen die Keycloak-JWKS geprüften ID-Token, also
              // `oauth` — mit dem `authSource` als Provider und den geprüften
              // Claims als rohem Profil. `providerId` ist dort nur eine Beschriftung
              // (nicht leer), kein Abgleich mit den registrierten Providern.
              {
                method: 'oauth',
                oauth: { providerId: authSource || 'mobile', profile: { ...payload } },
              }
            );
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

          // Outside the try: a missing secret is a server fault, not a bad code.
          const secret = getAuthTokenSecret();
          let payload: { sub?: string; token_use?: string; jti?: string };
          try {
            const verified = await jwtVerify<{ sub?: string; token_use?: string; jti?: string }>(
              code,
              secret,
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

          if (payload.token_use !== 'app_login_code' || !payload.sub || !payload.jti) {
            log.warn('[TokenExchangeCode] Invalid token payload', {
              token_use: payload.token_use,
              hasSub: Boolean(payload.sub),
              hasJti: Boolean(payload.jti),
            });
            throw new Error('Invalid token payload');
          }

          // `getDel` is the single-use gate. The signature alone would let the
          // same code be redeemed repeatedly for its full lifetime.
          const storedUserId = await redisClient.getDel(
            `${APP_LOGIN_CODE_REDIS_PREFIX}${payload.jti}`
          );
          if (storedUserId == null) {
            log.warn('[TokenExchangeCode] Login code already used or expired (jti consumed)');
            throw new Error('Login code is invalid or expired');
          }
          if (storedUserId !== payload.sub) {
            // Signature and store disagree — treat as tampering, not as a stale entry.
            log.error('[TokenExchangeCode] Login code subject mismatch');
            captureAuthIssue({
              stage: 'token-exchange',
              cause: new Error('login code subject mismatch'),
              extras: { path: 'login-code' },
            });
            throw new Error('Login code is invalid or expired');
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
