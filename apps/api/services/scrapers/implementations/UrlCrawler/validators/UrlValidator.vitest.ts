/**
 * The gate in front of every crawl.
 *
 * The address check is `validateUrlForFetch`, the same one safeFetch uses, and
 * it runs in every environment — a check that only runs in production is one
 * no test run ever sees. DNS is mocked so the resolver's answer is part of the
 * test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type LookupRecord = { address: string; family: number };

const lookupRecords = vi.fn<() => LookupRecord[]>();

vi.mock('dns', () => ({
  lookup: (
    _hostname: string,
    _options: unknown,
    cb: (err: Error | null, addresses?: LookupRecord[]) => void
  ) => {
    try {
      cb(null, lookupRecords());
    } catch (err) {
      cb(err as Error);
    }
  },
}));

// Only the robots.txt request is replaced; the validator itself stays real.
const safeFetch = vi.fn<(url: string) => Promise<Response>>();

vi.mock('../../../../../utils/validation/urlSecurity.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../utils/validation/urlSecurity.js')>()),
  safeFetch: (url: string) => safeFetch(url),
}));

const { UrlValidator } = await import('./UrlValidator.js');

beforeEach(() => {
  lookupRecords.mockReset();
  lookupRecords.mockReturnValue([{ address: '93.184.216.34', family: 4 }]);
  safeFetch.mockReset();
  safeFetch.mockResolvedValue(new Response('', { status: 404 }));
});

describe('UrlValidator.validateUrl — internal targets', () => {
  it.each([
    'http://169.254.169.254/latest/meta-data',
    'http://0.0.0.0:3001/',
    'http://[::1]/',
    'http://127.0.0.1/',
    'http://10.0.0.5/admin',
  ])('rejects %s', async (url) => {
    await expect(UrlValidator.validateUrl(url)).resolves.toMatchObject({ isValid: false });
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('rejects a host name that resolves to a loopback address', async () => {
    lookupRecords.mockReturnValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(UrlValidator.validateUrl('https://intern.example/a')).resolves.toEqual({
      isValid: false,
      error: 'Host resolves to private IP address',
    });
  });

  it('rejects regardless of robots.txt being skipped', async () => {
    await expect(
      UrlValidator.validateUrl('http://169.254.169.254/', { checkRobots: false })
    ).resolves.toMatchObject({ isValid: false });
  });

  it('accepts a public host', async () => {
    await expect(UrlValidator.validateUrl('https://public.example/a')).resolves.toEqual({
      isValid: true,
    });
  });
});

/**
 * "No robots.txt" means allowed, and that stays. A refusal by safeFetch is not
 * "no robots.txt": the host steered even that request towards an address we
 * will not open, and that must not read as permission to crawl it.
 */
describe('UrlValidator.validateUrl — robots.txt', () => {
  it('fails closed when safeFetch refuses a redirect hop of robots.txt', async () => {
    safeFetch.mockRejectedValue(
      new Error('URL validation failed: Host resolves to private IP address')
    );

    await expect(UrlValidator.validateUrl('https://hop.example/a')).resolves.toMatchObject({
      isValid: false,
    });
  });

  it('fails closed when the connect-time address check refuses robots.txt', async () => {
    // undici wraps the refusal of `guardedLookup` in a `fetch failed`.
    safeFetch.mockRejectedValue(
      new TypeError('fetch failed', {
        cause: new Error(
          'URL validation failed: rebind.example resolves to private address 10.0.0.1'
        ),
      })
    );

    await expect(UrlValidator.validateUrl('https://rebind.example/a')).resolves.toMatchObject({
      isValid: false,
    });
  });

  it('still allows a URL whose robots.txt is unreachable', async () => {
    safeFetch.mockRejectedValue(
      new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') })
    );

    await expect(UrlValidator.validateUrl('https://down.example/a')).resolves.toEqual({
      isValid: true,
    });
  });

  it('still honours a Disallow', async () => {
    safeFetch.mockResolvedValue(new Response('User-agent: *\nDisallow: /', { status: 200 }));

    await expect(UrlValidator.validateUrl('https://closed.example/a')).resolves.toEqual({
      isValid: false,
      error: 'Diese URL erlaubt kein automatisches Lesen (robots.txt).',
    });
  });
});
