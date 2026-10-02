/**
 * URL Security Utilities
 * SSRF protection and URL validation
 */

import * as dns from 'dns';
import { type LookupFunction } from 'net';
import { URL } from 'url';
import { promisify } from 'util';

import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

const dnsLookup = promisify(dns.lookup);

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^224\./,
  /^240\./,
  /^255\./,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
];

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
 * IPv4-mapped IPv6 (`::ffff:169.254.169.254`) is normalised to dotted-quad
 * first: every range below is written for that notation, so without the
 * normalisation an AAAA record could carry a link-local address past all of
 * them.
 */
export function isPrivateAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  return PRIVATE_IP_RANGES.some((range) => range.test(mapped?.[1] ?? ip));
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

  const ipMatch = hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  if (ipMatch && !allowPrivateIPs && isPrivateAddress(hostname)) {
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

  const ipMatch = hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  if (ipMatch && !allowPrivateIPs && isPrivateAddress(hostname)) {
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
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
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
