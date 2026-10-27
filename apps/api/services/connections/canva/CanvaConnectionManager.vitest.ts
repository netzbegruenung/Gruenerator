/**
 * Disconnecting revokes the grant at Canva (the refresh token takes its access
 * tokens and the consent with it) — and still forgets it locally when Canva is
 * unreachable, so a user can always disconnect.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../../config/env.js', () => ({
  env: { CANVA_CLIENT_ID: 'cid', CANVA_CLIENT_SECRET: 'secret' },
}));
vi.mock('../../../utils/validation/encryption.js', () => ({
  encryptCredential: (v: string) => `enc:${v}`,
  decryptCredential: (v: string) => v.replace(/^enc:/, ''),
}));

const record = {
  access_token_encrypted: 'enc:at',
  refresh_token_encrypted: 'enc:rt',
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  scope: 'design:meta:read',
  display_name: 'Canva User',
  connected_at: '2026-10-27T00:00:00.000Z',
};
const update = vi.fn();
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    ensureInitialized: async () => {},
    queryOne: async () => ({ canva_connection: record }),
    update: (...a: unknown[]) => update(...a),
  }),
}));

const revokeToken = vi.fn();
vi.mock('../../api-clients/canvaClient.js', () => ({
  missingCanvaScopes: (scope: string | null) => (scope?.includes('folder:write') ? [] : ['x']),
  refreshTokens: vi.fn(),
  revokeToken: (...a: unknown[]) => revokeToken(...a),
}));

const { CanvaConnectionManager } = await import('./CanvaConnectionManager.js');

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({ data: [{}] });
});

describe('CanvaConnectionManager.disconnect', () => {
  it('revokes the refresh token at Canva, then removes the stored connection', async () => {
    revokeToken.mockResolvedValue(undefined);

    await CanvaConnectionManager.disconnect('user-1');

    expect(revokeToken).toHaveBeenCalledWith({ clientId: 'cid', clientSecret: 'secret' }, 'rt');
    expect(update).toHaveBeenCalledWith('profiles', { canva_connection: null }, { id: 'user-1' });
  });

  it('removes the stored connection even when Canva cannot be reached', async () => {
    revokeToken.mockRejectedValue(new Error('ECONNRESET'));

    await CanvaConnectionManager.disconnect('user-1');

    expect(update).toHaveBeenCalledWith('profiles', { canva_connection: null }, { id: 'user-1' });
  });
});

describe('CanvaConnectionManager.getStatus', () => {
  it('asks for a new authorization when the stored grant lacks a requested scope', async () => {
    const status = await CanvaConnectionManager.getStatus('user-1');

    expect(status).toMatchObject({ connected: true, needsReconnect: true });
  });
});
