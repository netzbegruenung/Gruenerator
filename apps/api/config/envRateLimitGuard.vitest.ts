import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return (await import('./env.js')).env;
}

describe('DISABLE_RATE_LIMITS production guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is ignored in production and logged loudly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await loadEnv({ NODE_ENV: 'production', DISABLE_RATE_LIMITS: 'true' });

    expect(env.DISABLE_RATE_LIMITS).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('DISABLE_RATE_LIMITS');
  });

  it('still works outside production', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await loadEnv({ NODE_ENV: 'development', DISABLE_RATE_LIMITS: 'true' });

    expect(env.DISABLE_RATE_LIMITS).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it('stays quiet in production when the flag is unset', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await loadEnv({ NODE_ENV: 'production', DISABLE_RATE_LIMITS: 'false' });

    expect(env.DISABLE_RATE_LIMITS).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });
});
