import { createAuthEndpoint } from 'better-auth/api';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

import type { BetterAuthPlugin } from 'better-auth';

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
    },
  } satisfies BetterAuthPlugin;
};
