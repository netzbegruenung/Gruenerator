import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import pg from 'pg';

import { loadConfig } from '../database/services/PostgresService/config.js';
import { redisClient } from '../utils/redis/client.js';

const KC_BASE = process.env.KEYCLOAK_BASE_URL || 'https://user.netzbegruenung.de';
const KC_REALM = process.env.KEYCLOAK_REALM || 'gruenerator';
const KC_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'Gruenerator';
const KC_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';
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

const pgConfig = loadConfig();
const pool = new pg.Pool(pgConfig);

export const auth = betterAuth({
  database: pool,
  basePath: '/api/auth/v2',

  user: {
    modelName: 'profiles',
    fields: {
      name: 'display_name',
      image: 'avatar_url',
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
      igel_modus: { type: 'boolean', required: false, defaultValue: false },
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
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      idToken: 'id_token',
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

  trustedOrigins: [
    'gruenerator://',
    ...(process.env.NODE_ENV === 'development' ? ['exp://', 'http://localhost:3000'] : []),
  ],

  advanced: {
    cookiePrefix: 'ba',
    generateId: false,
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
  ],
});

export type BetterAuthType = typeof auth;
