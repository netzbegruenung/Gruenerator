import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from '../database/schema/index.js';
import { loadConfig } from '../database/services/PostgresService/config.js';
import { mobileTokenExchange } from '../plugins/mobileTokenExchange.js';
import { createLogger } from '../utils/logger.js';
import { redisClient } from '../utils/redis/client.js';

import { ALLOWED_DOMAINS } from './domains.js';
import { env } from './env.js';

const KC_BASE = env.KEYCLOAK_BASE_URL;
const KC_REALM = env.KEYCLOAK_REALM;
const KC_CLIENT_ID = env.KEYCLOAK_CLIENT_ID;
const KC_CLIENT_SECRET = env.KEYCLOAK_CLIENT_SECRET ?? '';
const DISCOVERY_URL = `${KC_BASE}/realms/${KC_REALM}/.well-known/openid-configuration`;

function keycloakProvider(id: string, idpHint: string, locale: 'de-DE' | 'de-AT' = 'de-DE') {
  return {
    providerId: id,
    clientId: KC_CLIENT_ID,
    clientSecret: KC_CLIENT_SECRET,
    discoveryUrl: DISCOVERY_URL,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    authorizationUrlParams: { kc_idp_hint: idpHint },
    mapProfileToUser: (profile: Record<string, unknown>) => ({
      name: (profile.name as string) || (profile.preferred_username as string) || '',
      email: profile.email as string,
      emailVerified: (profile.email_verified as boolean) ?? false,
      image: (profile.picture as string) || null,
      locale,
      authSource: `${idpHint}-login`,
    }),
  };
}

const log = createLogger('BetterAuth');

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
  database: drizzleAdapter(db, { provider: 'pg', schema, debugLogs: true }),
  ...(env.BETTER_AUTH_URL != null && { baseURL: env.BETTER_AUTH_URL }),
  basePath: '/api/auth/v2',

  // Pipe Better Auth's internal logs to stdout so we see every signin/
  // signout/session decision and every adapter query the library makes.
  // Set `level: 'info'` to reduce noise once auth is stable. Routes to
  // `console.*` directly because Winston's variadic overloads don't
  // accept dynamic spreads cleanly. The `unknown[]` cast narrows Better
  // Auth's `any[]` callback signature to satisfy no-unsafe-argument.
  logger: {
    level: 'debug',
    log: (level, message, ...rawArgs) => {
      const args: unknown[] = rawArgs;
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
      wordpress_enabled: { type: 'boolean', required: false, defaultValue: false },
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
    accountLinking: {
      enabled: true,
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

  secondaryStorage: {
    get: async (key) => {
      const value = await redisClient.get(`ba:${key}`);
      return value ?? null;
    },
    set: async (key, value, ttl) => {
      if (ttl) {
        await redisClient.set(`ba:${key}`, value, { EX: ttl });
      } else {
        await redisClient.set(`ba:${key}`, value);
      }
    },
    delete: async (key) => {
      await redisClient.del(`ba:${key}`);
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

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          log.info(`[Auth] Creating user: email=${user.email}, name=${user.name}`);
          return { data: user };
        },
        after: async (user) => {
          log.info(`[Auth] User created: id=${user.id}, email=${user.email}`);
        },
      },
      update: {
        after: async (user) => {
          log.info(`[Auth] User updated: id=${user.id}, email=${user.email}`);
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          log.info(
            `[Auth] Creating session for user_id=${session.userId}, expiresAt=${String(session.expiresAt)}`
          );
          return { data: session };
        },
        after: async (session) => {
          log.info(
            `[Auth] Session created: id=${session.id}, user_id=${session.userId}, token_prefix=${session.token?.slice(0, 8) ?? 'NONE'}...`
          );
        },
      },
    },
    account: {
      create: {
        before: async (account) => {
          log.info(
            `[Auth] Linking account: provider=${account.providerId}, accountId=${account.accountId}, userId=${account.userId}`
          );
          return { data: account };
        },
        after: async (account) => {
          log.info(
            `[Auth] Account linked: id=${account.id}, provider=${account.providerId}, accountId=${account.accountId}, userId=${account.userId}`
          );
        },
      },
      update: {
        after: async (account) => {
          log.info(
            `[Auth] Account updated: id=${account.id}, provider=${account.providerId}, userId=${account.userId}`
          );
        },
      },
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
export type BetterAuthUser = typeof auth.$Infer.Session.user;
