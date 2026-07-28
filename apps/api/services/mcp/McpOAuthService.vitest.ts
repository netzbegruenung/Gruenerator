import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../../config/env.js', () => ({ env: { BASE_URL: 'https://gruenerator.eu' } }));
vi.mock('../../utils/validation/encryption.js', () => ({
  encryptCredential: vi.fn((v: string) => `enc:${v}`),
  decryptCredential: vi.fn((v: string) => v.replace(/^enc:/, '')),
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
} from '@modelcontextprotocol/sdk/client/auth.js';

import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

import { McpOAuthService } from './McpOAuthService.js';
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

function serverRow(oauthMeta: Record<string, unknown>, secretEncrypted: string | null = null) {
  return {
    id: 'srv-1',
    user_id: 'user-1',
    name: 'Test',
    url: 'https://mcp.example.com/mcp',
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
