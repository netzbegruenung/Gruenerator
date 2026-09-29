import { mcp } from '@better-auth/mcp';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { jwt } from 'better-auth/plugins/jwt';
import { describe, expect, it } from 'vitest';

import {
  CHAT_COMPLETIONS_SCOPE,
  MCP_CLIENT_REGISTRATION_SCOPES,
  MCP_OAUTH_SCOPES_SUPPORTED,
} from '../../config/mcpServer.js';

import { defaultAuthorizeScope } from './authorizeScopeDefault.js';

const BASE = 'https://gruenerator.eu/api/auth/v2';
const REDIRECT_URI = 'https://excel.gruenerator.eu/oauth-callback.html';

// Dieselben Scope-Optionen wie in `config/betterAuth.ts`.
const auth = betterAuth({
  baseURL: 'https://gruenerator.eu',
  basePath: '/api/auth/v2',
  secret: 'test-secret-that-is-long-enough-for-better-auth-0123456789',
  // Der Speicher-Adapter kennt nur Tabellen, die hier schon stehen.
  database: memoryAdapter(
    Object.fromEntries(
      [
        'user',
        'session',
        'account',
        'verification',
        'jwks',
        'oauthClient',
        'oauthResource',
        'oauthClientResource',
        'oauthAccessToken',
        'oauthRefreshToken',
        'oauthConsent',
      ].map((model) => [model, []])
    )
  ),
  logger: { disabled: true },
  hooks: { before: defaultAuthorizeScope(MCP_CLIENT_REGISTRATION_SCOPES) },
  plugins: [
    jwt(),
    mcp({
      loginPage: '/login',
      consentPage: '/oauth/consent',
      resource: 'https://mcp.gruenerator.eu',
      scopes: [...MCP_OAUTH_SCOPES_SUPPORTED],
      clientRegistrationDefaultScopes: [...MCP_CLIENT_REGISTRATION_SCOPES],
      clientRegistrationAllowedScopes: [CHAT_COMPLETIONS_SCOPE],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }) as unknown as BetterAuthPlugin,
  ],
});

/** So registriert sich das Excel-Add-in (`gruenerator-excel`, `registerClient`). */
async function registerAddin(): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/oauth2/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Grünerator für Excel',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'chat:completions offline_access',
      }),
    })
  );
}

type AuthorizeMethod = 'GET' | 'POST';

/**
 * Ohne Sitzung leitet `/oauth2/authorize` zum Login — mit dem Scope, den es gewählt hat.
 *
 * POST ist die Formular-Variante aus RFC 6749 §3.1: der Endpunkt liest dann den
 * Body statt der Query, und der Haken muss dort einsetzen.
 */
async function authorizedScope(
  clientId: string,
  scope: string | null,
  method: AuthorizeMethod = 'GET'
): Promise<string[]> {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    state: 'state-123',
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
  });
  if (scope !== null) params.set('scope', scope);

  const request =
    method === 'GET'
      ? new Request(`${BASE}/oauth2/authorize?${params.toString()}`)
      : new Request(`${BASE}/oauth2/authorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

  const response = await auth.handler(request);
  const location = new URL(response.headers.get('location') ?? '', 'https://gruenerator.eu');
  expect(location.pathname).toBe('/login');
  return (location.searchParams.get('scope') ?? '').split(' ');
}

describe('dynamic registration and chat:completions', () => {
  it('lets the Excel add-in register with chat:completions', async () => {
    const response = await registerAddin();
    expect(response.status).toBe(201);
  });

  describe.each<AuthorizeMethod>(['GET', 'POST'])('authorize via %s', (method) => {
    it('grants chat:completions to a client that asks for it', async () => {
      const { client_id } = (await (await registerAddin()).json()) as { client_id: string };
      expect(await authorizedScope(client_id, 'chat:completions offline_access', method)).toEqual([
        'chat:completions',
        'offline_access',
      ]);
    });

    it('falls back to the default list, without chat:completions, when scope is omitted', async () => {
      const { client_id } = (await (await registerAddin()).json()) as { client_id: string };
      const scopes = await authorizedScope(client_id, null, method);
      expect(scopes).toEqual(MCP_CLIENT_REGISTRATION_SCOPES);
      expect(scopes).not.toContain(CHAT_COMPLETIONS_SCOPE);
    });
  });

  it('gives a client migrated from 1.6 (scopes NULL) the default list too', async () => {
    const ctx = await auth.$context;
    await ctx.adapter.create({
      model: 'oauthClient',
      data: {
        clientId: 'migrated-claude-ai',
        name: 'Claude',
        redirectUris: [REDIRECT_URI],
        tokenEndpointAuthMethod: 'none',
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        public: true,
        disabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect(await authorizedScope('migrated-claude-ai', null)).not.toContain(CHAT_COMPLETIONS_SCOPE);
  });
});
