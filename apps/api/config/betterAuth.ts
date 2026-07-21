import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { type UserProfile } from '@gruenerator/contracts';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { bearer } from 'better-auth/plugins/bearer';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from '../database/schema/index.js';
import { loadConfig } from '../database/services/PostgresService/config.js';
import { mobileTokenExchange } from '../plugins/mobileTokenExchange.js';
import { createLogger } from '../utils/logger.js';
import { captureAuthIssue } from '../utils/observability/captureAuthIssue.js';
import { redisClient } from '../utils/redis/client.js';

import { ALLOWED_DOMAINS } from './domains.js';
import { env } from './env.js';
import { mapKeycloakProfileToUser } from './mapKeycloakProfileToUser.js';

const KC_BASE = env.KEYCLOAK_BASE_URL;
const KC_REALM = env.KEYCLOAK_REALM;
const KC_CLIENT_ID = env.KEYCLOAK_CLIENT_ID;
const KC_CLIENT_SECRET = env.KEYCLOAK_CLIENT_SECRET ?? '';
const DISCOVERY_URL = `${KC_BASE}/realms/${KC_REALM}/.well-known/openid-configuration`;

const log = createLogger('BetterAuth');

function keycloakProvider(id: string, idpHint: string, locale: 'de-DE' | 'de-AT' = 'de-DE') {
  return {
    providerId: id,
    clientId: KC_CLIENT_ID,
    clientSecret: KC_CLIENT_SECRET,
    discoveryUrl: DISCOVERY_URL,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    authorizationUrlParams: { kc_idp_hint: idpHint },
    mapProfileToUser: (profile: Record<string, unknown>) =>
      mapKeycloakProfileToUser(profile, idpHint, locale),
  };
}

const pgConfig = loadConfig();
const pool = new pg.Pool(pgConfig);
const db = drizzle(pool, { schema });

// One-shot config snapshot at module load — answers "what URL did the
// container actually pick up?" without requiring a request to fire.
log.info(
  '[BetterAuth Config] baseURL=%s, basePath=/api/auth/v2, NODE_ENV=%s, allowedDomains=%d',
  env.BETTER_AUTH_URL ?? 'NOT_SET (Better Auth will infer from request host)',
  env.NODE_ENV,
  ALLOWED_DOMAINS.length
);

export const auth = betterAuth({
  // `debugLogs: true` makes the Drizzle adapter print every query in three
  // separate multi-line entries (input, DB result, parsed result), each
  // dumping the full row including JWT bodies. That's ~170 lines per query
  // and ~1200 lines per signin flow. Useful for active debugging of Better
  // Auth's internal query path, useless in production. Gated to LOG_LEVEL.
  // The databaseHooks below still emit structured one-line events for
  // session/account/user create+update, which covers normal observability.
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    debugLogs: env.LOG_LEVEL === 'debug',
  }),
  ...(env.BETTER_AUTH_URL != null && { baseURL: env.BETTER_AUTH_URL }),
  basePath: '/api/auth/v2',

  // Pipe Better Auth's internal logs to stdout. Level is gated to LOG_LEVEL
  // so production gets only warn+error (sign-in failures, anomalies) while
  // active debugging with LOG_LEVEL=debug gets the full firehose. Routes to
  // `console.*` directly because Winston's variadic overloads don't accept
  // dynamic spreads cleanly. The `unknown[]` cast narrows Better Auth's
  // `any[]` callback signature to satisfy no-unsafe-argument.
  //
  // Known-benign error downgrade: "Failed to parse state" fires whenever
  // an OAuth callback URL is replayed after the one-shot verification row
  // was already consumed or its 10-minute TTL expired. Common triggers are
  // link-preview bots prefetching the callback (Slack, iMessage), browser
  // back button after a successful login, and tabs left open across the
  // TTL window. Better Auth's own fallback already redirects the user to
  // `?error=please_restart_the_process`, so the user experience is fine —
  // the only damage was the full `StateError` object landing in the prod
  // error log and looking like a real incident. We downgrade to warn with
  // a one-line summary so a genuine attack pattern (spike in rate) is
  // still visible while routine replay noise stops paging anyone.
  logger: {
    level: env.LOG_LEVEL === 'debug' ? 'debug' : 'warn',
    log: (level, message, ...rawArgs) => {
      const args: unknown[] = rawArgs;
      if (level === 'error' && message === 'Failed to parse state') {
        const err = args[0] as { code?: string; message?: string } | undefined;
        console.warn(
          `[BA:warn] oauth state replay code=${err?.code ?? 'unknown'} (benign: expired or already-consumed callback)`
        );
        return;
      }
      // Known Better Auth secondary-storage corruption: a partial/corrupt
      // `ba:<token>` Redis value makes deleteSession early-return WITHOUT
      // deleting the DB row or firing hooks — leaving a revoked session's row
      // alive (a silent half-logged-in source). Not benign; alert on it.
      if (
        level === 'error' &&
        typeof message === 'string' &&
        /not found in secondary storage/i.test(message)
      ) {
        captureAuthIssue({ stage: 'better-auth', cause: new Error(message), extras: { args } });
      }
      const sink =
        level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      sink(`[BA:${level}]`, message, ...args);
    },
  },

  user: {
    modelName: 'profiles',
    fields: {
      name: 'display_name',
      image: 'avatar_url',
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    additionalFields: {
      keycloak_id: { type: 'string', required: false },
      username: { type: 'string', required: false },
      locale: { type: 'string', required: false, defaultValue: 'de-DE' },
      auth_source: { type: 'string', required: false, fieldName: 'auth_source' },
      first_name: { type: 'string', required: false },
      last_name: { type: 'string', required: false },
      custom_prompt: { type: 'string', required: false },
      custom_antrag_gliederung: { type: 'string', required: false },
      presseabbinder: { type: 'string', required: false },
      chat_color: { type: 'string', required: false },
      document_mode: { type: 'string', required: false, defaultValue: 'manual' },
      avatar_robot_id: { type: 'number', required: false, defaultValue: 1 },
      profile_image: { type: 'number', required: false, defaultValue: 1 },
      is_admin: { type: 'boolean', required: false, defaultValue: false },
      deutschlandmodus: { type: 'boolean', required: false, defaultValue: false },
      groups_enabled: { type: 'boolean', required: false, defaultValue: false },
      groups: { type: 'boolean', required: false, defaultValue: false },
      custom_generators: { type: 'boolean', required: false, defaultValue: false },
      database_access: { type: 'boolean', required: false, defaultValue: false },
      collab: { type: 'boolean', required: false, defaultValue: false },
      notebook: { type: 'boolean', required: false, defaultValue: false },
      sharepic: { type: 'boolean', required: false, defaultValue: false },
      anweisungen: { type: 'boolean', required: false, defaultValue: false },
      content_management: { type: 'boolean', required: false, defaultValue: false },
      labor_enabled: { type: 'boolean', required: false, defaultValue: false },
      sites_enabled: { type: 'boolean', required: false, defaultValue: true },
      sites: { type: 'boolean', required: false, defaultValue: false },
      chat: { type: 'boolean', required: false, defaultValue: false },
      website: { type: 'boolean', required: false, defaultValue: false },
      ai_sharepic: { type: 'boolean', required: false, defaultValue: false },
      vorlagen: { type: 'boolean', required: false, defaultValue: false },
      video_editor: { type: 'boolean', required: false, defaultValue: false },
      scanner: { type: 'boolean', required: false, defaultValue: false },
      prompts: { type: 'boolean', required: false, defaultValue: false },
      interactive_antrag_enabled: { type: 'boolean', required: false, defaultValue: true },
      docs: { type: 'boolean', required: false, defaultValue: false },
      boards: { type: 'boolean', required: false, defaultValue: false },
      bundestag_api_enabled: { type: 'boolean', required: false, defaultValue: false },
      memory_enabled: { type: 'boolean', required: false, defaultValue: false },
    },
  },

  session: {
    modelName: 'ba_sessions',
    fields: {
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    expiresIn: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    storeSessionInDatabase: true,
    cookieCache: {
      enabled: true,
      // 300s = Better Auth's default. This is the IDLE-TOLERANCE window: while
      // the signed `ba.session_data` snapshot is valid, getSession answers from
      // it without a store lookup, so an idle user isn't logged out for up to
      // 5 min. A previous change to 60s cut that to ~1 min and logged idle users
      // out far too aggressively. The prolonged "half logged in" state is
      // prevented by the unified 401 teardown (getSession stays authoritative
      // on real 401s via disableCookieCache) — NOT by shrinking this window, so
      // 300s is the right value. Do NOT disable: that puts Redis/PG on every
      // request's hot path.
      maxAge: 300,
    },
    additionalFields: {
      push_token: { type: 'string', required: false },
      device_name: { type: 'string', required: false },
      device_type: { type: 'string', required: false, defaultValue: 'web' },
    },
  },

  account: {
    modelName: 'ba_accounts',
    fields: {
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      idToken: 'id_token',
      scope: 'scope',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // Trust all four Keycloak providers for account linking. Without this,
    // Better Auth's link-account.mjs:18-26 refuses to link an OAuth account
    // to an existing user unless the provider is trusted OR the OAuth profile
    // returns email_verified: true. Some Keycloak realms don't always return
    // a verified email claim, which causes `account_not_linked` errors on
    // sign-in. All four IdPs route through trusted Keycloak realms operated
    // by netzbegruenung, so trusting them is safe.
    // `requireLocalEmailVerified` defaults to `true` since better-auth 1.6.11.
    // It's a SECOND, separate gate from `trustedProviders`: even a trusted
    // provider is refused with `account_not_linked` when the *existing local*
    // user has `email_verified = false` (link-account.mjs: `requireLocalEmailVerified
    // && !dbUser.user.emailVerified`). Many of our profiles were created via OAuth
    // before the email_verified claim was reliably stored, so they sit at false —
    // and the upgrade to 1.6.11 silently started rejecting their first login via a
    // second IdP (e.g. an existing Grünerator-login account signing in via Grünes
    // Netz). We disable it because the threat it defends against (ghost-account
    // hijacking via local email/password signup) does not exist here: there is no
    // `emailAndPassword` provider, all auth flows through the four Keycloak realms
    // we operate, and `trustedProviders` is restricted to exactly those realms.
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: false,
      trustedProviders: [
        'keycloak-netzbegruenung',
        'keycloak-gruenes-netz',
        'keycloak-gruene-at',
        'keycloak-gruenerator',
      ],
    },
  },

  verification: {
    modelName: 'ba_verification',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // Redis failures must not bubble into Better Auth's session resolution:
  // `get` returning null falls back to the Postgres session row
  // (storeSessionInDatabase: true), and a lost `set` only skips the cache.
  // `delete` is the exception — swallowing it would leave a revoked session
  // readable from Redis until its TTL expires, so it logs and rethrows.
  secondaryStorage: {
    get: async (key) => {
      try {
        const value = await redisClient.get(`ba:${key}`);
        return value ?? null;
      } catch (err) {
        log.warn('secondaryStorage.get failed for ba:%s — falling back to DB: %s', key, err);
        return null;
      }
    },
    set: async (key, value, ttl) => {
      try {
        if (ttl) {
          await redisClient.set(`ba:${key}`, value, { EX: ttl });
        } else {
          await redisClient.set(`ba:${key}`, value);
        }
      } catch (err) {
        log.warn('secondaryStorage.set failed for ba:%s — cache write skipped: %s', key, err);
      }
    },
    delete: async (key) => {
      try {
        await redisClient.del(`ba:${key}`);
      } catch (err) {
        log.error('secondaryStorage.delete failed for ba:%s — session revocation at risk', key);
        throw err;
      }
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: 'secondary-storage',
    customRules: {
      '/sign-in/*': { window: 60, max: 10 },
      '/sign-up/*': { window: 60, max: 5 },
      '/forget-password': { window: 60, max: 3 },
    },
  },

  trustedOrigins: [
    'gruenerator://',
    // Tauri desktop app webview origins — Better Auth rejects untrusted origins
    // (CSRF protection). macOS/Linux: tauri://localhost, Windows: http://tauri.localhost.
    'tauri://localhost',
    'http://tauri.localhost',
    ...ALLOWED_DOMAINS.map((d) => `https://${d}`),
    ...(env.NODE_ENV === 'development'
      ? ['exp://', 'http://localhost:3000', 'http://localhost:5050']
      : []),
  ],

  advanced: {
    trustedProxyHeaders: true,
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'],
    },
    cookiePrefix: 'ba',
    database: {
      generateId: false,
    },
    crossSubDomainCookies: (() => {
      const config: { enabled: boolean; domain?: string } = {
        enabled: true,
      };
      if (env.NODE_ENV === 'production') {
        config.domain = '.gruenerator.eu';
      }
      return config;
    })(),
  },

  // Database hooks emit one line per meaningful auth event. The previous
  // shape had `before` hooks that just announced the upcoming write — they
  // carried no diagnostic value beyond the matching `after` hook (if the
  // write fails, you'd see the error from Better Auth, not our log), so
  // they were dropped. Six lines of noise per signin removed.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          log.info(`[Auth] user-created id=${user.id} email=${user.email}`);
        },
      },
      update: {
        after: async (user) => {
          log.info(`[Auth] user-updated id=${user.id} email=${user.email}`);
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          log.info(
            `[Session] created id=${session.id} user=${session.userId} token=${session.token?.slice(0, 8) ?? 'NONE'} expires=${session.expiresAt instanceof Date ? session.expiresAt.toISOString() : String(session.expiresAt)}`
          );
          // Deliver one-off product announcements (e.g. new Pride avatars) on
          // login — once per user, idempotent, best-effort.
          const { deliverLoginAnnouncements } =
            await import('../services/notifications/loginAnnouncements.js');
          await deliverLoginAnnouncements(session.userId);
        },
      },
      // Rolling refresh (updateAge: 24h) touches the session at most once per
      // user per day — so this line is low-volume and makes rotation visible.
      // A user rotating more than once a day is anomalous (rotation-loop bug).
      update: {
        after: async (session) => {
          log.info(
            `[Session] rotated id=${session.id} user=${session.userId} token=${session.token?.slice(0, 8) ?? 'NONE'} expires=${session.expiresAt instanceof Date ? session.expiresAt.toISOString() : String(session.expiresAt)}`
          );
        },
      },
      // First-time visibility into revocation AND expiry-purge-on-read. `reason`
      // is inferred from expiry: a row whose expiresAt is already past was
      // purged when getSession read it; otherwise it's an explicit sign-out.
      delete: {
        after: async (session) => {
          const expiresAt =
            session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt);
          const expired = expiresAt.getTime() < Date.now();
          log.info(
            `[Session] deleted id=${session.id} user=${session.userId} token=${session.token?.slice(0, 8) ?? 'NONE'} expired=${expired} reason=${expired ? 'expired-on-read' : 'revoked'}`
          );
        },
      },
    },
    account: {
      create: {
        after: async (account) => {
          log.info(
            `[Auth] account-linked id=${account.id} provider=${account.providerId} user=${account.userId}`
          );
        },
      },
      update: {
        after: async (account) => {
          log.info(
            `[Auth] account-updated id=${account.id} provider=${account.providerId} user=${account.userId}`
          );
        },
      },
    },
  },

  // Surface SILENT OAuth-callback failures. handleOAuthUserInfo ends a failed
  // sign-in with `throw ctx.redirect(errorURL?error=<code>)` — `account_not_linked`,
  // `email_is_missing`, `email_doesn't_match`, plus any error Keycloak passes
  // through. A thrown redirect is NOT an error, so `onAPIError` below never fires,
  // and Better Auth's own "account isn't linked" warning is `isDevelopment()`-gated
  // — so in production these failures leave no trace at all (this is exactly what
  // made the 1.6.11 `requireLocalEmailVerified` regression invisible). The caught
  // redirect sets `responseHeaders` (carrying `location`) before `runAfterHooks`
  // runs, so this after-hook can read the error code off the redirect target and
  // log + cluster it in GlitchTip (`auth.stage=oauth-callback`, fingerprint per
  // code). Benign replay/expiry codes are skipped to keep bot noise out.
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith('/oauth2/callback')) return;
      const location = ctx.context.responseHeaders?.get('location');
      if (location == null) return;
      let code: string | null = null;
      try {
        code = new URL(location, env.BETTER_AUTH_URL ?? 'http://localhost').searchParams.get(
          'error'
        );
      } catch {
        code = null;
      }
      if (code == null || code === 'please_restart_the_process' || code === 'state_mismatch') {
        return;
      }
      const providerId = ctx.path.split('/').pop() ?? 'unknown';
      log.warn(`[Auth] oauth-callback provider=${providerId} redirected with error=${code}`);
      const synthetic = new Error(`oauth-callback redirected with error=${code}`);
      synthetic.name = code;
      captureAuthIssue({ stage: 'oauth-callback', cause: synthetic, extras: { providerId, code } });
    }),
  },

  // Forward Better Auth's caught endpoint errors (sign-in, sign-up, callback,
  // token-exchange, etc.) to GlitchTip. Without this, errors that Better Auth
  // handles internally (responding 400/401 to the client) never reach the
  // Express error middleware and never reach Sentry. The "Failed to parse
  // state" warn-downgrade in the `logger:` block above still suppresses
  // benign OAuth replays; `isBenignAuthError` inside `captureAuthIssue`
  // catches any that slip through, and the sentinel on already-captured
  // errors prevents double-capture from plugin endpoints that have already
  // called `captureAuthIssue` before re-throwing.
  onAPIError: {
    onError: (error, ctx) => {
      const path = (ctx as { path?: unknown } | undefined)?.path;
      const pathStr = typeof path === 'string' ? path : 'unknown';
      const stage = pathStr.includes('token-exchange')
        ? 'token-exchange'
        : pathStr.includes('callback')
          ? 'oauth-callback'
          : 'better-auth';
      captureAuthIssue({ stage, cause: error, extras: { path: pathStr } });
    },
  },

  plugins: [
    genericOAuth({
      config: [
        keycloakProvider('keycloak-netzbegruenung', 'netzbegruenung'),
        keycloakProvider('keycloak-gruenes-netz', 'gruenes-netz'),
        keycloakProvider('keycloak-gruene-at', 'gruene-at-login', 'de-AT'),
        keycloakProvider('keycloak-gruenerator', 'gruenerator-user'),
      ],
    }),
    bearer(),
    mobileTokenExchange(),
  ],
});

export type BetterAuthType = typeof auth;
export type BetterAuthSession = typeof auth.$Infer.Session;

// Better Auth's `$Infer.Session.user` already includes every column declared
// in `additionalFields` above — `avatar_robot_id`, `is_admin`, `first_name`,
// all feature flags etc. are typed as `T | null | undefined` (null because
// Better Auth stores unset optional columns as SQL NULL). We expose this
// type directly; `authMiddleware.toBetterAuthUser()` coerces null → undefined
// and Zod's `.default(...)` on the schema fills the final values.
export type BetterAuthUser = typeof auth.$Infer.Session.user;
