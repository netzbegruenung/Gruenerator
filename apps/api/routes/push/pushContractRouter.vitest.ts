/**
 * Registrierung bindet das Gerät an die Sitzung — ohne Sitzung kein Push,
 * außer beim lokalen Dev-Bypass, der keine Sitzungszeile hat.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = { NODE_ENV: 'production', ALLOW_DEV_AUTH_BYPASS: false };
vi.mock('../../config/env.js', () => ({ env }));
const getSession = vi.fn();
vi.mock('../../config/betterAuth.js', () => ({ auth: { api: { getSession } } }));
const registerPushDevice = vi.fn(async (_input: Record<string, unknown>) => 'dev-id');
const unregisterPushDevice = vi.fn(async (_userId: string, _id: string) => {});
vi.mock('../../services/push/pushDevices.js', () => ({ registerPushDevice, unregisterPushDevice }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { DEV_BYPASS_USER_ID } = await import('../../config/devAuthBypass.js');
const { pushContractRouter } = await import('./pushContractRouter.js');

const KEY = Buffer.alloc(32, 7).toString('base64');
const body = {
  platform: 'ios' as const,
  token: 'apns-token',
  key: KEY,
  apnsEnvironment: 'sandbox' as const,
};
const req = (userId: string) => ({ user: { id: userId }, headers: {} });

beforeEach(() => {
  vi.clearAllMocks();
  env.NODE_ENV = 'production';
  env.ALLOW_DEV_AUTH_BYPASS = false;
});

describe('pushContractRouter.register', () => {
  it('binds the device to the session that registered it', async () => {
    getSession.mockResolvedValue({ session: { id: 'sess-1' } });
    const res = await pushContractRouter.register({ req: req('u1'), body } as never);
    expect(res).toEqual({ status: 200, body: { id: 'dev-id' } });
    expect(registerPushDevice).toHaveBeenCalledWith({
      userId: 'u1',
      sessionId: 'sess-1',
      platform: 'ios',
      token: 'apns-token',
      key: Buffer.alloc(32, 7),
      apnsEnvironment: 'sandbox',
    });
  });

  it('refuses without a resolvable session', async () => {
    getSession.mockResolvedValue(null);
    const res = await pushContractRouter.register({ req: req('u1'), body } as never);
    expect(res.status).toBe(401);
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it('allows a session-less row only for the local dev bypass', async () => {
    env.NODE_ENV = 'development';
    env.ALLOW_DEV_AUTH_BYPASS = true;
    await pushContractRouter.register({ req: req(DEV_BYPASS_USER_ID), body } as never);
    expect(getSession).not.toHaveBeenCalled();
    expect(registerPushDevice).toHaveBeenCalledWith(expect.objectContaining({ sessionId: null }));

    env.NODE_ENV = 'production';
    getSession.mockResolvedValue(null);
    const res = await pushContractRouter.register({ req: req(DEV_BYPASS_USER_ID), body } as never);
    expect(res.status).toBe(401);
  });
});

describe('pushContractRouter.unregister', () => {
  it('deletes only within the authenticated user', async () => {
    await pushContractRouter.unregister({ req: req('u1'), params: { id: 'd1' } } as never);
    expect(unregisterPushDevice).toHaveBeenCalledWith('u1', 'd1');
  });
});
