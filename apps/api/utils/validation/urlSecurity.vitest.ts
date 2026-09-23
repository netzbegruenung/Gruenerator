/**
 * The SSRF guard in front of every user-supplied URL.
 *
 * The DNS branch is the part that used to be decidable by luck: it read a
 * single address out of the resolver, so a hostname with one public and one
 * private record passed or failed depending on which record came back first —
 * while the socket afterwards could still take the private one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const { validateUrlForFetch, isPrivateAddress } = await import('./urlSecurity.js');

beforeEach(() => {
  lookupRecords.mockReset();
  lookupRecords.mockReturnValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('validateUrlForFetch — DNS records', () => {
  it('accepts a host whose records are all public', async () => {
    lookupRecords.mockReturnValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);

    await expect(validateUrlForFetch('https://example.com/a')).resolves.toMatchObject({
      isValid: true,
    });
  });

  it('rejects when any record is private, not just the first', async () => {
    lookupRecords.mockReturnValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);

    await expect(validateUrlForFetch('https://rebind.example/a')).resolves.toMatchObject({
      isValid: false,
      // The offending address is named: which record it was is what makes the
      // difference between a misconfiguration and an attempt.
      error: 'Host resolves to private IP address 169.254.169.254',
    });
  });

  it('rejects an IPv4-mapped private address in an AAAA record', async () => {
    lookupRecords.mockReturnValue([{ address: '::ffff:169.254.169.254', family: 6 }]);

    await expect(validateUrlForFetch('https://mapped.example/a')).resolves.toMatchObject({
      isValid: false,
    });
  });

  it('rejects a host that resolves to nothing', async () => {
    lookupRecords.mockReturnValue([]);

    await expect(validateUrlForFetch('https://void.example/a')).resolves.toMatchObject({
      isValid: false,
      // Distinct from the lookup error below on purpose: an empty answer is not
      // the same event as a resolver that failed.
      error: 'DNS returned no addresses',
    });
  });

  it('rejects a host whose lookup fails', async () => {
    lookupRecords.mockImplementation(() => {
      throw new Error('ENOTFOUND');
    });

    await expect(validateUrlForFetch('https://nx.example/a')).resolves.toMatchObject({
      isValid: false,
      error: 'DNS lookup failed for host',
    });
  });
});

describe('validateUrlForFetch — checks that need no resolver', () => {
  it.each([
    ['http://localhost/x', 'Localhost and internal hosts are not allowed'],
    ['http://169.254.169.254/latest/meta-data', 'Localhost and internal hosts are not allowed'],
    ['http://10.0.0.5/admin', 'Private IP addresses are not allowed'],
    ['file:///etc/passwd', 'Protocol file: is not allowed'],
  ])('rejects %s', async (url, error) => {
    await expect(validateUrlForFetch(url)).resolves.toMatchObject({ isValid: false, error });
  });
});

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1'])(
    '%s is private',
    (ip) => expect(isPrivateAddress(ip)).toBe(true)
  );

  it.each(['93.184.216.34', '8.8.8.8', '2606:2800:220:1:248:1893:25c8:1946'])(
    '%s is public',
    (ip) => expect(isPrivateAddress(ip)).toBe(false)
  );
});
