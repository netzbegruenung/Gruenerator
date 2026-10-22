import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  NODE_ENV: 'development' as string,
  SESSION_SECRET: null as string | null,
}));

vi.mock('../config/env.js', () => ({ env: envMock }));

/** Fresh module per case: the helper caches its key for the process. */
async function load() {
  vi.resetModules();
  return (await import('./authTokenSecret.js')).getAuthTokenSecret;
}

beforeEach(() => {
  envMock.NODE_ENV = 'development';
  envMock.SESSION_SECRET = null;
});

describe('getAuthTokenSecret', () => {
  it('uses SESSION_SECRET when it is set', async () => {
    envMock.NODE_ENV = 'production';
    envMock.SESSION_SECRET = 'configured-secret';
    const getAuthTokenSecret = await load();

    expect(new TextDecoder().decode(getAuthTokenSecret())).toBe('configured-secret');
  });

  it.each([null, ''])('throws in production when SESSION_SECRET is %j', async (secret) => {
    envMock.NODE_ENV = 'production';
    envMock.SESSION_SECRET = secret;
    const getAuthTokenSecret = await load();

    expect(() => getAuthTokenSecret()).toThrow(/SESSION_SECRET must be set in production/);
  });

  it('falls back to a random key per process in development', async () => {
    const first = await load();
    const key = first();

    expect(key).toHaveLength(32);
    expect(first()).toBe(key);
    expect(new TextDecoder().decode(key)).not.toBe('fallback-secret-please-change');

    const otherProcess = await load();
    expect(Buffer.from(otherProcess()).equals(Buffer.from(key))).toBe(false);
  });
});
