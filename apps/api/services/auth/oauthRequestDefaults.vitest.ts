import { mcp } from '@better-auth/mcp';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { jwt } from 'better-auth/plugins/jwt';
import { signedOAuthQuery } from '@gruenerator/shared/auth';
import { describe, expect, it } from 'vitest';

import {
  CHAT_COMPLETIONS_SCOPE,
  MCP_CLIENT_REGISTRATION_SCOPES,
  MCP_OAUTH_SCOPES_SUPPORTED,
} from '../../config/mcpServer.js';

import { oauthRequestDefaults } from './oauthRequestDefaults.js';

const BASE = 'https://gruenerator.eu/api/auth/v2';
const REDIRECT_URI = 'https://excel.gruenerator.eu/oauth-callback.html';
const RESOURCE = 'https://mcp.gruenerator.eu';

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
  // Nur hier, damit der Test eine Sitzung bekommt; produktiv meldet Keycloak an.
  emailAndPassword: { enabled: true },
  hooks: { before: oauthRequestDefaults(MCP_CLIENT_REGISTRATION_SCOPES, RESOURCE) },
  plugins: [
    jwt(),
    mcp({
      loginPage: '/login',
      consentPage: '/oauth/consent',
      resource: RESOURCE,
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

describe('resource indicator spelling (RFC 8707)', () => {
  const CLAUDE_REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

  async function registerClaude(): Promise<string> {
    const response = await auth.handler(
      new Request(`${BASE}/oauth2/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Claude',
          redirect_uris: [CLAUDE_REDIRECT],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      })
    );
    return ((await response.json()) as { client_id: string }).client_id;
  }

  // Das MCP-SDK sendet `new URL(prm.resource).href` — bei einer pfadlosen
  // Ressource also mit Slash am Ende.
  it.each([RESOURCE, `${RESOURCE}/`])('authorize accepts %s', async (resource) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: await registerClaude(),
      redirect_uri: CLAUDE_REDIRECT,
      state: 'state-123',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      resource,
    });
    const response = await auth.handler(
      new Request(`${BASE}/oauth2/authorize?${params.toString()}`)
    );
    const location = new URL(response.headers.get('location') ?? '', 'https://gruenerator.eu');
    expect(location.searchParams.get('error')).toBeNull();
    expect(location.pathname).toBe('/login');
    // Die signierte Anfrage, mit der das Plugin nach dem Login weitermacht.
    expect(location.searchParams.get('resource')).toBe(RESOURCE);
  });

  // So wie der Browser: ohne Sitzung zu `/login`, dort anmelden, zurück zu
  // `authorize`, weiter zur Zustimmung. Login- und Zustimmungsseite schicken
  // die signierte Anfrage per `signedOAuthQuery` als `oauth_query` mit.
  it('full flow with the slash spelling issues a token for the registered resource', async () => {
    const clientId = await registerClaude();
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: CLAUDE_REDIRECT,
      state: 'state-123',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      resource: `${RESOURCE}/`,
    });
    const authorize = await auth.handler(
      new Request(`${BASE}/oauth2/authorize?${params.toString()}`)
    );
    const loginPage = new URL(authorize.headers.get('location') ?? '', 'https://gruenerator.eu');
    expect(loginPage.pathname).toBe('/login');
    // Ein Parameter, den unsere Loginseite selbst kennt, darf die Signatur nicht brechen.
    loginPage.searchParams.set('login', 'gruenerator');

    const signUp = await auth.handler(
      new Request(`${BASE}/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'flow@example.org',
          password: 'password-123456',
          name: 'Flow',
          oauth_query: signedOAuthQuery(loginPage.search),
        }),
      })
    );
    const cookie = signUp.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const resumed = (await signUp.json()) as { url?: string };
    const consentPage = new URL(resumed.url ?? '', 'https://gruenerator.eu');
    expect(consentPage.pathname).toBe('/oauth/consent');

    const consent = await auth.handler(
      new Request(`${BASE}/oauth2/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ accept: true, oauth_query: signedOAuthQuery(consentPage.search) }),
      })
    );
    const { url } = (await consent.json()) as { url: string };
    const code = new URL(url).searchParams.get('code') ?? '';
    const token = await auth.handler(
      new Request(`${BASE}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: CLAUDE_REDIRECT,
          resource: `${RESOURCE}/`,
        }).toString(),
      })
    );
    const { access_token } = (await token.json()) as { access_token: string };
    const [, payload] = access_token.split('.');
    const { aud } = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as {
      aud: string[];
    };
    // Genau das `aud`, gegen das `verifyOAuthResourceRequest` prüft.
    expect(aud).toContain(RESOURCE);
  });
});
