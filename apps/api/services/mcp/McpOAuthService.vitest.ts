import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  env: { BASE_URL: 'https://gruenerator.eu' } as Record<string, string | undefined>,
}));

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
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
vi.mock('../../config/env.js', () => ({ env: h.env }));
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
  validateUrlForFetch: vi.fn(async () => ({ isValid: true })),
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

  it('uses the platform client from env for Canva instead of registering', async () => {
    h.env.CANVA_MCP_CLIENT_ID = 'canva-cid';
    h.env.CANVA_MCP_CLIENT_SECRET = 'canva-secret';
    try {
      vi.mocked(discoverOAuthServerInfo).mockResolvedValue({
        authorizationServerUrl: 'https://mcp.canva.com',
        authorizationServerMetadata: {
          issuer: 'https://mcp.canva.com',
          registration_endpoint: 'https://mcp.canva.com/register',
        },
      } as never);
      const set = vi.fn(() => ({ where: async () => undefined }));
      vi.mocked(getDrizzleInstance).mockReturnValue({
        ...dbStub(serverRow({}, null, 'https://mcp.canva.com/mcp')),
        update: () => ({ set }),
      } as never);

      await McpOAuthService.startAuthorization('user-1', 'srv-1');

      expect(registerClient).not.toHaveBeenCalled();
      expect(vi.mocked(startAuthorization).mock.calls[0]?.[1].clientInformation).toEqual({
        client_id: 'canva-cid',
        client_secret: 'canva-secret',
      });
      // Never copied into the row: a rotated secret must reach every user.
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ oauth_meta: expect.objectContaining({ scheme: 'platform' }) })
      );
      expect(set.mock.calls[0]?.[0]).not.toHaveProperty('oauth_client_secret_encrypted');
    } finally {
      delete h.env.CANVA_MCP_CLIENT_ID;
      delete h.env.CANVA_MCP_CLIENT_SECRET;
    }
  });

  it('falls back to dynamic registration for Canva when the env is unset', async () => {
    vi.mocked(discoverOAuthServerInfo).mockResolvedValue({
      authorizationServerUrl: 'https://mcp.canva.com',
      authorizationServerMetadata: {
        issuer: 'https://mcp.canva.com',
        registration_endpoint: 'https://mcp.canva.com/register',
      },
    } as never);
    vi.mocked(getDrizzleInstance).mockReturnValue(
      dbStub(serverRow({}, null, 'https://mcp.canva.com/mcp')) as never
    );

    await McpOAuthService.startAuthorization('user-1', 'srv-1');

    expect(registerClient).toHaveBeenCalledOnce();
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

describe('platform client — resolved from env on every use', () => {
  const canvaRow = (meta: Record<string, unknown>) =>
    serverRow(
      { redirectUri: 'https://gruenerator.eu/api/mcp/auth/callback', ...meta },
      'enc:stale-secret',
      'https://mcp.canva.com/mcp'
    );

  it('redeems the code with the current env secret, not a stored one', async () => {
    h.env.CANVA_MCP_CLIENT_ID = 'canva-cid';
    h.env.CANVA_MCP_CLIENT_SECRET = 'rotated-secret';
    try {
      vi.mocked(getDrizzleInstance).mockReturnValue(
        dbStub(canvaRow({ clientId: 'canva-cid', scheme: 'platform' })) as never
      );
      vi.mocked(consumeOAuthState).mockResolvedValue(state() as never);

      await McpOAuthService.handleCallback('code', 'state-token');

      expect(vi.mocked(exchangeAuthorization).mock.calls[0]?.[1].clientInformation).toEqual({
        client_id: 'canva-cid',
        client_secret: 'rotated-secret',
      });
    } finally {
      delete h.env.CANVA_MCP_CLIENT_ID;
      delete h.env.CANVA_MCP_CLIENT_SECRET;
    }
  });

  it('fails the callback when the platform env was removed', async () => {
    vi.mocked(getDrizzleInstance).mockReturnValue(
      dbStub(canvaRow({ clientId: 'canva-cid', scheme: 'platform' })) as never
    );
    vi.mocked(consumeOAuthState).mockResolvedValue(state() as never);

    await expect(McpOAuthService.handleCallback('code', 'state-token')).rejects.toThrow(
      /Konfiguration fehlt/
    );
    expect(exchangeAuthorization).not.toHaveBeenCalled();
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
