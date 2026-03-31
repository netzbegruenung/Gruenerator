import { createAuthEndpoint } from 'better-auth/api';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { BetterAuthPlugin } from 'better-auth';

const KC_BASE = process.env.KEYCLOAK_BASE_URL || 'https://user.netzbegruenung.de';
const KC_REALM = process.env.KEYCLOAK_REALM || 'gruenerator';
const KC_ISSUER = `${KC_BASE}/realms/${KC_REALM}`;
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
            throw new Error('idToken is required');
          }

          const { payload } = await jwtVerify(idToken, JWKS, {
            issuer: KC_ISSUER,
          });

          const email = payload.email as string;
          if (!email) {
            throw new Error('Token missing email claim');
          }

          const locale = LOCALE_MAP[authSource || ''] || 'de-DE';
          const name =
            (payload.name as string) ||
            (payload.preferred_username as string) ||
            email.split('@')[0];

          const existing = await ctx.context.internalAdapter.findUserByEmail(email);

          let userData;
          if (existing) {
            userData = existing.user;
          } else {
            const created = await ctx.context.internalAdapter.createUser({
              email,
              name,
              emailVerified: (payload.email_verified as boolean) ?? false,
              locale,
              auth_source: authSource || 'mobile',
              keycloak_id: payload.sub || null,
            });
            userData = created.user;
          }

          const session = await ctx.context.internalAdapter.createSession(userData.id, false);

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
