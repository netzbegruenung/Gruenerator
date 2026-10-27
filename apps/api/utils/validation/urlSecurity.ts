/**
 * URL Security Utilities
 * SSRF protection and URL validation
 */

import * as dns from 'dns';
import { BlockList, isIP, type LookupFunction } from 'net';
import { URL } from 'url';
import { promisify } from 'util';

import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

const dnsLookup = promisify(dns.lookup);

/**
 * Ranges we never open a socket to. A `BlockList` instead of string-prefix
 * regexes because IPv6 has many spellings of one address (`fd12::1`,
 * `FD12:0:0::1`, `fd12:0000::0001`); `BlockList` compares the parsed bits, so
 * a range covers every notation, and it matches IPv4-mapped IPv6
 * (`::ffff:a9fe:a9fe`, `::ffff:169.254.169.254`) against the IPv4 ranges.
 */
const PRIVATE_RANGES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 3], // multicast 224/4 + reserved 240/4 incl. broadcast
] as const) {
  PRIVATE_RANGES.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 96], // unspecified, loopback, deprecated IPv4-compatible
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8], // multicast
] as const) {
  PRIVATE_RANGES.addSubnet(network, prefix, 'ipv6');
}

/** NAT64 well-known prefix: the low 32 bits are an IPv4 address. */
const NAT64 = new BlockList();
NAT64.addSubnet('64:ff9b::', 96, 'ipv6');

/** The IPv4 address in the low 32 bits of an IPv6 address. */
function lowIpv4(ipv6: string): string {
  // WHATWG URL canonicalises IPv6 to lower-case hex groups (no dotted quad),
  // so expanding `::` is all that is left to do.
  const canonical = new URL(`http://[${ipv6}]/`).hostname.slice(1, -1);
  const [head, tail = ''] = canonical.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const groups = canonical.includes('::')
    ? [
        ...headGroups,
        ...Array<string>(8 - headGroups.length - tailGroups.length).fill('0'),
        ...tailGroups,
      ]
    : headGroups;
  const high = parseInt(groups[6], 16);
  const low = parseInt(groups[7], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
  '169.254.169.254',
];

export interface UrlValidationResult {
  isValid: boolean;
  error?: string;
  url?: URL;
}

export interface UrlValidationOptions {
  allowPrivateIPs?: boolean;
  allowedProtocols?: string[];
  allowedHosts?: string[];
  blockedHosts?: string[];
  skipDnsCheck?: boolean;
}

/**
 * True when `ip` is an address we must never open a socket to.
 *
 * Exported because the search-image proxy resolves names itself and pins the
 * connection to the address it checked — check and connect have to share one
 * range list, and a second copy would drift away from this one.
 *
 * IPv4-mapped IPv6 (`::ffff:169.254.169.254`, `::ffff:a9fe:a9fe`) is checked
 * against the IPv4 ranges, so an AAAA record cannot carry a link-local address
 * past them; NAT64 (`64:ff9b::/96`) is checked by its embedded IPv4 address.
 * Anything that is not an IP address is not private by this check (names go
 * through DNS).
 */
export function isPrivateAddress(ip: string): boolean {
  // A zone id (`fe80::1%eth0`) is not part of the address and makes
  // `BlockList.check` answer false.
  const address = ip.replace(/%.*$/, '');
  const family = isIP(address);
  if (family === 4) return PRIVATE_RANGES.check(address, 'ipv4');
  if (family !== 6) return false;
  if (PRIVATE_RANGES.check(address, 'ipv6')) return true;
  return NAT64.check(address, 'ipv6') && PRIVATE_RANGES.check(lowIpv4(address), 'ipv4');
}

/** `URL.hostname` without the brackets an IPv6 literal carries, if it is an IP. */
function ipLiteral(hostname: string): string | null {
  const bare = hostname.replace(/^\[(.*)\]$/, '$1');
  return isIP(bare) !== 0 ? bare : null;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.includes(lower);
}

export async function validateUrlForFetch(
  urlString: string,
  options: UrlValidationOptions = {}
): Promise<UrlValidationResult> {
  const {
    allowPrivateIPs = false,
    allowedProtocols = ['http:', 'https:'],
    allowedHosts = [],
    blockedHosts = [],
    skipDnsCheck = false,
  } = options;

  if (!urlString || typeof urlString !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string' };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }

  if (!allowedProtocols.includes(url.protocol)) {
    return { isValid: false, error: `Protocol ${url.protocol} is not allowed` };
  }

  const hostname = url.hostname.toLowerCase();

  if (blockedHosts.length > 0 && blockedHosts.includes(hostname)) {
    return { isValid: false, error: 'Host is blocked' };
  }

  if (allowedHosts.length > 0 && !allowedHosts.includes(hostname)) {
    return { isValid: false, error: 'Host is not in allowlist' };
  }

  if (isBlockedHostname(hostname)) {
    return { isValid: false, error: 'Localhost and internal hosts are not allowed' };
  }

  // IP literals are decided here, without a resolver — `URL.hostname` keeps the
  // brackets of an IPv6 literal, which DNS would only reject by accident.
  const ipMatch = ipLiteral(hostname);
  if (ipMatch && !allowPrivateIPs && isPrivateAddress(ipMatch)) {
    return { isValid: false, error: 'Private IP addresses are not allowed' };
  }

  if (!skipDnsCheck && !ipMatch && !allowPrivateIPs) {
    try {
      // `all: true` — the single-address form returns whichever record the
      // resolver hands back first, so a name with one public and one private
      // record passed the check about half the time while the socket could
      // still land on the private one. Every record has to be public.
      const records = await dnsLookup(hostname, { all: true });
      if (records.length === 0) {
        return { isValid: false, error: 'DNS lookup failed for host' };
      }
      if (records.some((record) => isPrivateAddress(record.address))) {
        return { isValid: false, error: 'Host resolves to private IP address' };
      }
    } catch {
      return { isValid: false, error: 'DNS lookup failed for host' };
    }
  }

  return { isValid: true, url };
}

export function validateUrlSync(
  urlString: string,
  options: UrlValidationOptions = {}
): UrlValidationResult {
  const {
    allowPrivateIPs = false,
    allowedProtocols = ['http:', 'https:'],
    allowedHosts = [],
    blockedHosts = [],
  } = options;

  if (!urlString || typeof urlString !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string' };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }

  if (!allowedProtocols.includes(url.protocol)) {
    return { isValid: false, error: `Protocol ${url.protocol} is not allowed` };
  }

  const hostname = url.hostname.toLowerCase();

  if (blockedHosts.length > 0 && blockedHosts.includes(hostname)) {
    return { isValid: false, error: 'Host is blocked' };
  }

  if (allowedHosts.length > 0 && !allowedHosts.includes(hostname)) {
    return { isValid: false, error: 'Host is not in allowlist' };
  }

  if (isBlockedHostname(hostname)) {
    return { isValid: false, error: 'Localhost and internal hosts are not allowed' };
  }

  // `URL.hostname` keeps the brackets of an IPv6 literal; strip them first.
  const ipMatch = ipLiteral(hostname);
  if (ipMatch && !allowPrivateIPs && isPrivateAddress(ipMatch)) {
    return { isValid: false, error: 'Private IP addresses are not allowed' };
  }

  return { isValid: true, url };
}

/**
 * Redirect hops safeFetch follows. Legitimate sites use one or two
 * (http→https, trailing-slash, canonical host); more is either broken or an
 * attempt to walk us somewhere. Each hop is re-validated, so this bounds cost.
 */
const MAX_SAFE_FETCH_REDIRECTS = 3;

/**
 * Credential headers that must not cross an origin boundary. The WHATWG fetch
 * algorithm strips these on a cross-origin redirect; our hand-rolled redirect
 * loop has to do the same or it would leak them to the redirect target.
 */
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

/**
 * The `connect.lookup` behind safeFetch: resolves the name and refuses the
 * socket if any record is private. Because the check runs inside the connect,
 * the address checked is the address connected to — a name that resolved
 * public for `validateUrlForFetch` and private a moment later (DNS rebinding)
 * never reaches a socket.
 *
 * Exported for HTTP clients that resolve names themselves (axios `lookup`, got
 * `dnsLookup`). Node skips `lookup` for IP literals, so a client that follows
 * redirects can still be walked to `http://169.254.169.254/` — this guard only
 * holds for clients that do not follow redirects, or validate every hop.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, records) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    const priv = records.find((record) => isPrivateAddress(record.address));
    if (records.length === 0 || priv) {
      const reason = priv ? `resolves to private address ${priv.address}` : 'no addresses';
      callback(new Error(`URL validation failed: ${hostname} ${reason}`), '', 0);
      return;
    }
    if (options.all) {
      callback(null, records);
    } else {
      callback(null, records[0].address, records[0].family);
    }
  });
};

const guardedDispatcher = new Agent({ connect: { lookup: guardedLookup } });

/**
 * True when `error` is a refusal of this module — a URL or redirect hop that
 * failed validation, or an address `guardedLookup` would not connect to —
 * rather than an ordinary network failure. undici wraps the connect-time
 * refusal in `TypeError('fetch failed')`, so the cause is checked as well.
 */
export function isUrlValidationError(error: unknown): boolean {
  const refused = (value: unknown): boolean =>
    value instanceof Error && value.message.startsWith('URL validation failed');
  return refused(error) || (error instanceof Error && refused(error.cause));
}

/**
 * Fetch a user-influenced URL with SSRF protection that also covers redirects.
 *
 * Redirects are followed by hand with `redirect: 'manual'` and every hop is
 * re-validated in full before we make the next request — with default
 * following, a `302 Location: http://169.254.169.254/…` would walk past a
 * check that only covered the first URL.
 *
 * The connection itself goes through `guardedDispatcher`, which re-checks the
 * resolved addresses at connect time, so the validator's own DNS answer is
 * only an early, readable rejection — not the guarantee.
 *
 * Credential headers (`Authorization`/`Cookie`/`Proxy-Authorization`) are
 * stripped once a redirect crosses to a different origin than the original
 * request, matching native fetch — otherwise a redirect to an attacker host
 * would receive the caller's bearer token.
 */
export async function safeFetch(
  urlString: string,
  fetchOptions: RequestInit = {},
  validationOptions: UrlValidationOptions = {}
): Promise<Response> {
  let currentUrl = urlString;
  let originalOrigin: string | null = null;
  let stripCredentials = false;

  for (let hop = 0; ; hop++) {
    const validation = await validateUrlForFetch(currentUrl, validationOptions);
    if (!validation.isValid || !validation.url) {
      throw new Error(`URL validation failed: ${validation.error}`);
    }

    if (originalOrigin === null) {
      originalOrigin = validation.url.origin;
    } else if (!stripCredentials && validation.url.origin !== originalOrigin) {
      // Left the original origin — never send credential headers again, even if
      // a later hop redirects back (conservative, matches "strip once crossed").
      stripCredentials = true;
    }

    const headers = new Headers(fetchOptions.headers);
    if (stripCredentials) {
      for (const name of CREDENTIAL_HEADERS) headers.delete(name);
    }

    // Force manual redirect handling so we can re-validate each Location; a
    // caller-supplied `redirect` must never re-open the follow-blindly hole.
    // Boundary casts: undici's fetch is the runtime's fetch, but its own
    // package types are not the DOM lib's. `dispatcher` is what global fetch
    // cannot take from this undici version.
    const response = (await undiciFetch(validation.url.toString(), {
      ...(fetchOptions as UndiciRequestInit),
      headers: Object.fromEntries(headers),
      redirect: 'manual',
      ...(validationOptions.allowPrivateIPs ? {} : { dispatcher: guardedDispatcher }),
    })) as unknown as Response;

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) {
      return response;
    }

    const location = response.headers.get('location');
    // A 3xx without a Location is not a redirect we can follow — hand it back.
    if (!location) {
      return response;
    }
    if (hop >= MAX_SAFE_FETCH_REDIRECTS) {
      throw new Error('URL validation failed: too many redirects');
    }

    // Resolve relative Locations against the current URL, then loop to
    // re-validate the target before the next request is made.
    try {
      currentUrl = new URL(location, validation.url).toString();
    } catch {
      throw new Error('URL validation failed: unparseable redirect target');
    }
  }
}

export default {
  validateUrlForFetch,
  validateUrlSync,
  safeFetch,
};
