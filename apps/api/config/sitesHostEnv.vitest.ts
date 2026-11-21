import { afterEach, describe, expect, it, vi } from 'vitest';

const original = process.env.SITES_HOST;

afterEach(() => {
  if (original === undefined) delete process.env.SITES_HOST;
  else process.env.SITES_HOST = original;
  vi.resetModules();
});

const load = async () => {
  vi.resetModules();
  return (await import('./env.js')).env;
};

describe('SITES_HOST', () => {
  it.each(['grsites.de', 'beta.grsites.de', 'sites.localhost'])('accepts %s', async (host) => {
    process.env.SITES_HOST = host;
    expect((await load()).SITES_HOST).toBe(host);
  });

  it('lower-cases and trims', async () => {
    process.env.SITES_HOST = '  GrSites.DE ';
    expect((await load()).SITES_HOST).toBe('grsites.de');
  });

  it('keeps an empty value, which leaves the gate off', async () => {
    process.env.SITES_HOST = '';
    expect((await load()).SITES_HOST).toBe('');
  });

  it.each(['https://grsites.de', 'grsites.de:443', 'grsites.de/', 'grsites.de.', '.grsites.de'])(
    'rejects %s at boot',
    async (host) => {
      process.env.SITES_HOST = host;
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(load()).rejects.toThrow('Invalid environment variables');
    }
  );
});
