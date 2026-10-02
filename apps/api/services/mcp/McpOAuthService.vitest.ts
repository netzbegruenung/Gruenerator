import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/client/auth.js', async (importOriginal) => ({
  // Pure policy, no I/O — the real one, so revocation picks what the SDK would.
  selectClientAuthMethod: (
    await importOriginal<typeof import('@modelcontextprotocol/sdk/client/auth.js')>()
  ).selectClientAuthMethod,
  discoverOAuthServerInfo: vi.fn(),
  discoverAuthorizationServerMetadata: vi.fn(),
  registerClient: vi.fn(),
  startAuthorization: vi.fn(),
  exchangeAuthorization: vi.fn(),
  refreshAuthorization: vi.fn(),
}));
vi.mock('./mcpOAuthState.js', () => ({
  consumeOAuthState: vi.fn(),
  generateState: vi.fn(() => 'state-token'),
  saveOAuthState: vi.fn(),
}));
vi.mock('../../database/services/DrizzleService.js', () => ({ getDrizzleInstance: vi.fn() }));
vi.mock('../../config/env.js', () => ({ env: { BASE_URL: 'https://gruenerator.eu' } }));
vi.mock('../../utils/validation/encryption.js', () => ({
  encryptCredential: vi.fn((v: string) => `enc:${v}`),
  decryptCredential: vi.fn((v: string) => v.replace(/^enc:/, '')),
}));
vi.mock('../../utils/redis/client.js', () => ({
  ensureConnected: vi.fn(async () => undefined),
  redisClient: {
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    exists: vi.fn(async () => 0),
  },
}));
vi.mock('../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: vi.fn(async (u: string) => ({ isValid: true, url: new URL(u) })),
}));

import {
  discoverOAuthServerInfo,
  discoverAuthorizationServerMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  refreshAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';

import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { redisClient } from '../../utils/redis/client.js';

import { McpOAuthService, selectScopes, selectTokenEndpointAuthMethod } from './McpOAuthService.js';
import { consumeOAuthState, saveOAuthState } from './mcpOAuthState.js';

const AS = 'https://as.example.com';

/** Minimal chainable stand-in for the drizzle query builder. */
function dbStub(row: Record<string, unknown> | null) {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
}

function serverRow(
  oauthMeta: Record<string, unknown>,
  secretEncrypted: string | null = null,
  url = 'https://mcp.example.com/mcp'
) {
  return {
    id: 'srv-1',
    user_id: 'user-1',
    name: 'Test',
    url,
    oauth_meta: oauthMeta,
    oauth_client_secret_encrypted: secretEncrypted,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    serverId: 'srv-1',
    codeVerifier: 'verifier',
    authorizationServerUrl: AS,
    expectedIssuer: AS,
    issRequired: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  // Call counts are the assertion in most cases here, so they must not leak.
  vi.clearAllMocks();
  vi.mocked(getDrizzleInstance).mockReturnValue(
    dbStub(
      serverRow({ clientId: 'cid', redirectUri: 'https://gruenerator.eu/api/mcp/auth/callback' })
    ) as never
  );
  vi.mocked(discoverAuthorizationServerMetadata).mockResolvedValue({ issuer: AS } as never);
  vi.mocked(exchangeAuthorization).mockResolvedValue({ access_token: 'at' } as never);
});

/**
 * RFC 9207 / SEP-2468. The security property under test is not "it throws" but
 * "the code is never redeemed" — so every rejection case asserts that
 * exchangeAuthorization was not reached.
 */
describe('handleCallback — iss validation', () => {
  it('refuses to redeem the code when iss belongs to another AS', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue(state() as never);

    await expect(
      McpOAuthService.handleCallback('code', 'state-token', 'https://evil.example.com')
    ).rejects.toThrow(/anderen Authorization-Server/);
    expect(exchangeAuthorization).not.toHaveBeenCalled();
  });

  it('refuses when iss is missing but the AS advertised it', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue(state({ issRequired: true }) as never);

    await expect(McpOAuthService.handleCallback('code', 'state-token')).rejects.toThrow(
      /iss fehlt/
    );
    expect(exchangeAuthorization).not.toHaveBeenCalled();
  });

  it('allows a missing iss when the AS never advertised support (pre-RFC-9207)', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue(state({ issRequired: false }) as never);

    await expect(McpOAuthService.handleCallback('code', 'state-token')).resolves.toEqual({
      serverId: 'srv-1',
    });
    expect(exchangeAuthorization).toHaveBeenCalledOnce();
  });

  it('accepts a matching iss and ignores a trailing-slash difference', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue(state() as never);

    await expect(McpOAuthService.handleCallback('code', 'state-token', `${AS}/`)).resolves.toEqual({
      serverId: 'srv-1',
    });
    expect(exchangeAuthorization).toHaveBeenCalledOnce();
  });

  it('skips the check for in-flight states written before the field existed', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue(
      state({ expectedIssuer: undefined, issRequired: undefined }) as never
    );

    await expect(McpOAuthService.handleCallback('code', 'state-token')).resolves.toEqual({
      serverId: 'srv-1',
    });
  });
});

/** SEP-2352: credentials are bound to the AS that issued them. */
describe('startAuthorization — issuer binding', () => {
  beforeEach(() => {
    vi.mocked(discoverOAuthServerInfo).mockResolvedValue({
      authorizationServerUrl: AS,
      authorizationServerMetadata: {
        issuer: AS,
        authorization_endpoint: `${AS}/authorize`,
        token_endpoint: `${AS}/token`,
        registration_endpoint: `${AS}/register`,
      },
    } as never);
    vi.mocked(registerClient).mockResolvedValue({
      client_id: 'fresh-cid',
      client_secret: 'fresh-secret',
    } as never);
    vi.mocked(startAuthorization).mockResolvedValue({
      authorizationUrl: new URL(`${AS}/authorize?x=1`),
      codeVerifier: 'verifier',
    } as never);
  });

  it('re-registers instead of reusing a client_id minted by a different AS', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(
      dbStub(
        serverRow(
          { clientId: 'stale-cid', issuer: 'https://old-as.example.com', scheme: 'dcr' },
          'enc:stale-secret'
        )
      ) as never
    );

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(registerClient).toHaveBeenCalledOnce();
    // The stale credentials must not travel to the new AS.
    expect(vi.mocked(startAuthorization).mock.calls[0]?.[1].clientInformation).toEqual({
      client_id: 'fresh-cid',
      client_secret: 'fresh-secret',
    });
  });

  it('reuses the stored client when the issuer is unchanged', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(
      dbStub(serverRow({ clientId: 'known-cid', issuer: AS, scheme: 'dcr' })) as never
    );

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(registerClient).not.toHaveBeenCalled();
    expect(vi.mocked(startAuthorization).mock.calls[0]?.[1].clientInformation.client_id).toBe(
      'known-cid'
    );
  });

  it('fails loudly rather than silently re-registering hand-entered credentials', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(
      dbStub(
        serverRow({
          clientId: 'manual-cid',
          issuer: 'https://old-as.example.com',
          scheme: 'pre_registration',
        })
      ) as never
    );

    await expect(McpOAuthService.startAuthorization('user-1', 'srv-1')).rejects.toMatchObject({
      code: 'dcr_rejected',
    });
    expect(registerClient).not.toHaveBeenCalled();
  });

  it('pins the AS-declared issuer and its iss support into the state (SEP-2468)', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(
      dbStub(serverRow({ clientId: 'known-cid', issuer: AS, scheme: 'dcr' })) as never
    );

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(vi.mocked(saveOAuthState).mock.calls[0]?.[1]).toMatchObject({
      expectedIssuer: AS,
      issRequired: false,
    });
  });

  it('declares application_type on dynamic registration (SEP-837)', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(serverRow({})) as never);

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(vi.mocked(registerClient).mock.calls[0]?.[1].clientMetadata).toMatchObject({
      application_type: 'web',
    });
  });
});

/** Live discovery 2026-10-01: what each provider's metadata asks of us. */
describe('selectScopes', () => {
  it('requests what the resource declares, not the shared AS catalogue', () => {
    // Statista: PRM openid+profile; its Auth0 tenant lists 14 incl. phone/address.
    const auth0 = ['openid', 'profile', 'offline_access', 'email', 'phone', 'address'];
    expect(selectScopes(['openid', 'profile'], auth0)).toEqual([
      'openid',
      'profile',
      'offline_access',
    ]);
  });

  it('adds offline_access only when the AS offers it', () => {
    expect(selectScopes(['mcp'], ['mcp'])).toEqual(['mcp']);
    expect(selectScopes(['mcp', 'offline_access'], ['mcp', 'offline_access'])).toEqual([
      'mcp',
      'offline_access',
    ]);
  });

  it('requests nothing when the resource names no scopes', () => {
    expect(selectScopes(undefined, ['a', 'b'])).toBeUndefined();
    expect(selectScopes([], ['a', 'b'])).toBeUndefined();
  });
});

describe('selectTokenEndpointAuthMethod', () => {
  it('registers a public client where that is all the AS accepts (Brevo)', () => {
    expect(selectTokenEndpointAuthMethod(['none'])).toBe('none');
  });

  it('picks what the SDK will send at the token endpoint: basic, then post', () => {
    expect(selectTokenEndpointAuthMethod(['client_secret_post', 'client_secret_basic'])).toBe(
      'client_secret_basic'
    );
    expect(selectTokenEndpointAuthMethod(['none', 'client_secret_post'])).toBe(
      'client_secret_post'
    );
  });

  it('defaults to client_secret_basic when the AS does not say (RFC 8414 §2)', () => {
    expect(selectTokenEndpointAuthMethod(undefined)).toBe('client_secret_basic');
  });
});

describe('startAuthorization — what gets registered', () => {
  beforeEach(() => {
    vi.mocked(registerClient).mockResolvedValue({ client_id: 'fresh-cid' } as never);
    vi.mocked(startAuthorization).mockResolvedValue({
      authorizationUrl: new URL(`${AS}/authorize?x=1`),
      codeVerifier: 'verifier',
    } as never);
  });

  it('takes scopes from the PRM and the auth method from the AS', async () => {
    vi.mocked(discoverOAuthServerInfo).mockResolvedValue({
      authorizationServerUrl: AS,
      resourceMetadata: { resource: 'https://mcp.example.com/mcp', scopes_supported: ['all'] },
      authorizationServerMetadata: {
        issuer: AS,
        registration_endpoint: `${AS}/register`,
        scopes_supported: ['all', 'admin', 'billing'],
        token_endpoint_auth_methods_supported: ['none'],
      },
    } as never);
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(serverRow({})) as never);

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    const reg = vi.mocked(registerClient).mock.calls[0]?.[1];
    expect(reg?.clientMetadata).toMatchObject({ token_endpoint_auth_method: 'none', scope: 'all' });
    expect(vi.mocked(startAuthorization).mock.calls[0]?.[1].scope).toBe('all');
  });
});

describe('getValidAccessToken', () => {
  const HOUR = 3_600_000;

  function tokenRow(expiresAt: Date | null, refresh: string | null = 'enc:rt') {
    return {
      ...serverRow({ clientId: 'cid', issuer: AS }),
      token_encrypted: 'enc:old-at',
      refresh_token_encrypted: refresh,
      token_expires_at: expiresAt,
    };
  }

  it('returns null, not the dead token, when an expired token cannot be refreshed', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(
      dbStub(tokenRow(new Date(Date.now() - HOUR))) as never
    );
    vi.mocked(refreshAuthorization).mockRejectedValue(new Error('invalid_grant'));

    await expect(McpOAuthService.getValidAccessToken('user-1', 'srv-1')).resolves.toBeNull();
  });

  it('keeps a still-valid token when the early refresh fails', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(
      dbStub(tokenRow(new Date(Date.now() + 30_000))) as never
    );
    vi.mocked(refreshAuthorization).mockRejectedValue(new Error('timeout'));

    await expect(McpOAuthService.getValidAccessToken('user-1', 'srv-1')).resolves.toBe('old-at');
  });

  it('refreshes a token without expiry when forced after a 401', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(tokenRow(null)) as never);
    vi.mocked(refreshAuthorization).mockResolvedValue({ access_token: 'new-at' } as never);

    await expect(McpOAuthService.getValidAccessToken('user-1', 'srv-1')).resolves.toBe('old-at');
    await expect(
      McpOAuthService.getValidAccessToken('user-1', 'srv-1', { force: true })
    ).resolves.toBe('new-at');
    expect(refreshAuthorization).toHaveBeenCalledOnce();
  });

  it('returns null when forced but there is nothing to refresh with', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(tokenRow(null, null)) as never);

    await expect(
      McpOAuthService.getValidAccessToken('user-1', 'srv-1', { force: true })
    ).resolves.toBeNull();
  });
});

describe('getValidAccessToken — refresh already running elsewhere', () => {
  it('waits for the other refresh and returns the token it stored', async () => {
    let reads = 0;
    const row = (token: string) => ({
      ...serverRow({ clientId: 'cid', issuer: AS }),
      token_encrypted: `enc:${token}`,
      refresh_token_encrypted: 'enc:rt',
      token_expires_at: new Date(Date.now() - 1000),
    });
    vi.mocked(getDrizzleInstance).mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [row(reads++ === 0 ? 'old-at' : 'new-at')] }),
        }),
      }),
    } as never);
    vi.mocked(redisClient.set).mockResolvedValueOnce(null as never);
    vi.mocked(redisClient.exists)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(0 as never);

    await expect(McpOAuthService.getValidAccessToken('user-1', 'srv-1')).resolves.toBe('new-at');
    expect(refreshAuthorization).not.toHaveBeenCalled();
  });
});

/** SEP-991: our published document is the client where the AS supports it. */
describe('startAuthorization — Client ID Metadata Document', () => {
  const CIMD_URL = 'https://gruenerator.eu/api/mcp/auth/client-metadata.json';

  beforeEach(() => {
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(serverRow({})) as never);
    vi.mocked(registerClient).mockResolvedValue({ client_id: 'dcr-cid' } as never);
    vi.mocked(startAuthorization).mockResolvedValue({
      authorizationUrl: new URL(`${AS}/authorize?x=1`),
      codeVerifier: 'verifier',
    } as never);
  });

  function discover(cimd: boolean) {
    vi.mocked(discoverOAuthServerInfo).mockResolvedValue({
      authorizationServerUrl: AS,
      authorizationServerMetadata: {
        issuer: AS,
        registration_endpoint: `${AS}/register`,
        client_id_metadata_document_supported: cimd,
      },
    } as never);
  }

  it('uses the document URL as client_id instead of registering', async () => {
    discover(true);

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(registerClient).not.toHaveBeenCalled();
    expect(vi.mocked(startAuthorization).mock.calls[0]?.[1].clientInformation).toEqual({
      client_id: CIMD_URL,
    });
  });

  it('registers dynamically where the AS does not read documents', async () => {
    discover(false);

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(registerClient).toHaveBeenCalledOnce();
  });

  it('publishes a public-client document whose client_id is its own URL', () => {
    expect(McpOAuthService.clientMetadataDocument()).toMatchObject({
      client_id: CIMD_URL,
      redirect_uris: ['https://gruenerator.eu/api/mcp/auth/callback'],
      token_endpoint_auth_method: 'none',
    });
  });
});

/** RFC 7009: removing a connector also kills its tokens at the provider. */
describe('tokenRevocation', () => {
  const fetchMock = vi.fn();

  function oauthRow(secret: string | null) {
    return {
      ...serverRow({ clientId: 'cid', issuer: AS }, secret),
      auth_type: 'oauth',
      token_encrypted: 'enc:at',
      refresh_token_encrypted: 'enc:rt',
    };
  }

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('revokes refresh and access token with basic auth for a confidential client', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(oauthRow('enc:secret')) as never);
    vi.mocked(discoverAuthorizationServerMetadata).mockResolvedValue({
      issuer: AS,
      revocation_endpoint: `${AS}/revoke`,
      token_endpoint_auth_methods_supported: ['client_secret_basic'],
    } as never);

    await (
      await McpOAuthService.tokenRevocation('user-1', 'srv-1')
    )?.();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(`${AS}/revoke`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('cid:secret').toString('base64')}`
    );
    expect((init.body as URLSearchParams).get('token')).toBe('rt');
    expect((init.body as URLSearchParams).get('token_type_hint')).toBe('refresh_token');
  });

  it('sends client_id in the body for a public client', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(oauthRow(null)) as never);
    vi.mocked(discoverAuthorizationServerMetadata).mockResolvedValue({
      issuer: AS,
      revocation_endpoint: `${AS}/revoke`,
      token_endpoint_auth_methods_supported: ['none'],
    } as never);

    await (
      await McpOAuthService.tokenRevocation('user-1', 'srv-1')
    )?.();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect((init.body as URLSearchParams).get('client_id')).toBe('cid');
  });

  it('skips providers without a revocation endpoint', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(oauthRow(null)) as never);
    vi.mocked(discoverAuthorizationServerMetadata).mockResolvedValue({ issuer: AS } as never);

    await (
      await McpOAuthService.tokenRevocation('user-1', 'srv-1')
    )?.();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws — removal must go ahead when the provider is down', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(dbStub(oauthRow(null)) as never);
    vi.mocked(discoverAuthorizationServerMetadata).mockResolvedValue({
      issuer: AS,
      revocation_endpoint: `${AS}/revoke`,
    } as never);
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const revoke = await McpOAuthService.tokenRevocation('user-1', 'srv-1');
    await expect(revoke?.()).resolves.toBeUndefined();
  });
});

describe('startAuthorization — reusing and replacing clients', () => {
  beforeEach(() => {
    vi.mocked(startAuthorization).mockResolvedValue({
      authorizationUrl: new URL(`${AS}/authorize?x=1`),
      codeVerifier: 'verifier',
    } as never);
  });

  function captureSet(row: Record<string, unknown>) {
    const set = vi.fn(() => ({ where: async () => undefined }));
    vi.mocked(getDrizzleInstance).mockReturnValue({
      ...dbStub(row),
      update: () => ({ set }),
    } as never);
    return set;
  }

  it('keeps a reused DCR client a DCR client', async () => {
    vi.mocked(discoverOAuthServerInfo).mockResolvedValue({
      authorizationServerUrl: AS,
      authorizationServerMetadata: { issuer: AS, registration_endpoint: `${AS}/register` },
    } as never);
    const set = captureSet(serverRow({ clientId: 'dcr-cid', issuer: AS, scheme: 'dcr' }));

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(set.mock.calls[0]?.[0]).toMatchObject({ oauth_meta: { scheme: 'dcr' } });
  });

  it('clears an old secret when the new client is public', async () => {
    vi.mocked(discoverOAuthServerInfo).mockResolvedValue({
      authorizationServerUrl: AS,
      authorizationServerMetadata: {
        issuer: AS,
        registration_endpoint: `${AS}/register`,
        client_id_metadata_document_supported: true,
      },
    } as never);
    // Issuer moved → the stored DCR client and its secret are dropped.
    const set = captureSet(
      serverRow({ clientId: 'old', issuer: 'https://old.example.com', scheme: 'dcr' }, 'enc:old')
    );

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(set.mock.calls[0]?.[0]).toMatchObject({ oauth_client_secret_encrypted: null });
  });

  it('re-derives a CIMD client instead of reusing the stored URL', async () => {
    vi.mocked(discoverOAuthServerInfo).mockResolvedValue({
      authorizationServerUrl: AS,
      authorizationServerMetadata: { issuer: AS, registration_endpoint: `${AS}/register` },
    } as never);
    vi.mocked(registerClient).mockResolvedValue({ client_id: 'dcr-cid' } as never);
    captureSet(
      serverRow({ clientId: 'https://old.example/client.json', issuer: AS, scheme: 'cimd' })
    );

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    // The AS stopped reading documents → falls back to registration.
    expect(registerClient).toHaveBeenCalledOnce();
  });
});
