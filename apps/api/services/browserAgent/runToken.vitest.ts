import { createHmac } from 'crypto';

import { describe, expect, it, vi } from 'vitest';

const envMock = {
  BROWSER_AGENT_TOKEN_SECRET: 'token-secret' as string | undefined,
  BROWSER_AGENT_SECRET: 'service-secret' as string | undefined,
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

const { RUN_TOKEN_TTL_MS, isBrowserAgentConfigured, signRunToken, verifyRunToken } =
  await import('./runToken.js');

/** Ein Token, wie es jemand mit einem bestimmten Geheimnis selbst bauen könnte. */
function forge(secret: string, claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

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

  it('rejects a token signed with the secret the browser container holds', () => {
    const t = forge('service-secret', { runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 });
    expect(verifyRunToken(t)).toBeNull();
  });

  it('rejects a token that lives longer than any token we issue', () => {
    const now = Date.now();
    const atCap = signRunToken({ runId: 'r', userId: 'u', expiresAt: now + RUN_TOKEN_TTL_MS });
    expect(verifyRunToken(atCap, now)).toEqual({ runId: 'r', userId: 'u' });

    const tooLong = signRunToken({
      runId: 'r',
      userId: 'u',
      expiresAt: now + RUN_TOKEN_TTL_MS + 60_000,
    });
    expect(verifyRunToken(tooLong, now)).toBeNull();
    const forever = forge('token-secret', {
      runId: 'r',
      userId: 'u',
      expiresAt: now + 365 * 864e5,
    });
    expect(verifyRunToken(forever, now)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const t = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 });
    envMock.BROWSER_AGENT_TOKEN_SECRET = 'rotated';
    try {
      expect(verifyRunToken(t)).toBeNull();
    } finally {
      envMock.BROWSER_AGENT_TOKEN_SECRET = 'token-secret';
    }
  });

  it('refuses to sign and verifies nothing without a token secret', () => {
    const t = signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 });
    envMock.BROWSER_AGENT_TOKEN_SECRET = undefined;
    try {
      expect(isBrowserAgentConfigured()).toBe(false);
      expect(() =>
        signRunToken({ runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 })
      ).toThrow();
      expect(verifyRunToken(t)).toBeNull();
    } finally {
      envMock.BROWSER_AGENT_TOKEN_SECRET = 'token-secret';
    }
  });

  it('stays off when the token secret equals the service secret', () => {
    envMock.BROWSER_AGENT_TOKEN_SECRET = 'service-secret';
    try {
      expect(isBrowserAgentConfigured()).toBe(false);
      const t = forge('service-secret', { runId: 'r', userId: 'u', expiresAt: Date.now() + 1000 });
      expect(verifyRunToken(t)).toBeNull();
    } finally {
      envMock.BROWSER_AGENT_TOKEN_SECRET = 'token-secret';
    }
  });
});
