import { describe, expect, it, vi } from 'vitest';

const envMock = { BROWSER_AGENT_SECRET: 'test-secret' as string | undefined };
vi.mock('../../config/env.js', () => ({ env: envMock }));

const { signRunToken, verifyRunToken } = await import('./runToken.js');

describe('run token', () => {
  it('round-trips a token', () => {
    const t = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 });
    expect(verifyRunToken(t)).toEqual({ runId: 'r', userId: 'u' });
  });

  it('rejects tampered / expired tokens', () => {
    const t = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 });
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(
      JSON.stringify({ runId: 'r', userId: 'someone-else', expiresAt: Date.now() + 1000 })
    ).toString('base64url');
    expect(verifyRunToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyRunToken(`${payload}.${sig}x`)).toBeNull();
    expect(verifyRunToken('garbage')).toBeNull();
    expect(verifyRunToken('')).toBeNull();

    const expired = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() - 1 });
    expect(verifyRunToken(expired)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const t = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 });
    envMock.BROWSER_AGENT_SECRET = 'rotated';
    try {
      expect(verifyRunToken(t)).toBeNull();
    } finally {
      envMock.BROWSER_AGENT_SECRET = 'test-secret';
    }
  });

  it('refuses to sign and verifies nothing without a secret', () => {
    const t = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 });
    envMock.BROWSER_AGENT_SECRET = undefined;
    try {
      expect(() =>
        signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 })
      ).toThrow();
      expect(verifyRunToken(t)).toBeNull();
    } finally {
      envMock.BROWSER_AGENT_SECRET = 'test-secret';
    }
  });
});
