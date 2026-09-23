/**
 * URL Security Utilities
 * SSRF protection and URL validation
 */

import * as dns from 'dns';
import { URL } from 'url';
import { promisify } from 'util';

import { Agent, fetch as undiciFetch } from 'undici';

import type { LookupAddress } from 'dns';
import type { LookupFunction } from 'net';
import type { RequestInit as UndiciRequestInit } from 'undici';

const dnsLookup = promisify(dns.lookup);
/** Same resolver, the `all: true` overload — `promisify` cannot express both. */
const dnsLookupAll = dnsLookup as unknown as (
  hostname: string,
  options: { all: true; verbatim?: boolean }
) => Promise<LookupAddress[]>;

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
    // Same resolution rule as the pinned path below: every record has to be
    // public, not just the one the resolver happened to return first.
    const resolved = await resolvePinnedAddresses(hostname);
    if (!resolved.ok) {
      return { isValid: false, error: resolved.why };
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

/** Hostname → the addresses we resolved AND checked for it. */
export type PinnedHosts = Map<string, LookupAddress[]>;

/**
 * Resolve a hostname and hand back every address it answers with — rejecting
 * the name outright if any of them is private (unless the caller explicitly
 * allows private targets).
 *
 * `all: true` is the load-bearing option. A plain `dns.lookup` returns one
 * address, so a record listing a public and a private address passes a check on
 * whichever came first and then connects to whichever the runtime picks. Taking
 * all of them, and requiring all of them, removes that choice.
 *
 * `verbatim` keeps the resolver's own ordering; every entry is checked anyway,
 * so reordering could only ever hide one behind another.
 */
export async function resolvePinnedAddresses(
  hostname: string,
  { allowPrivateIPs = false }: { allowPrivateIPs?: boolean } = {}
): Promise<{ ok: true; addresses: LookupAddress[] } | { ok: false; why: string }> {
  let addresses: LookupAddress[];
  try {
    addresses = await dnsLookupAll(hostname, { all: true, verbatim: true });
  } catch {
    // Kept apart from the rejection below on purpose: a name that does not
    // resolve is a dead link, a name that resolves privately is an attempt. One
    // shared message would send someone hunting an attack that never happened.
    return { ok: false, why: 'DNS lookup failed for host' };
  }
  if (addresses.length === 0) return { ok: false, why: 'DNS returned no addresses' };
  if (!allowPrivateIPs) {
    const priv = addresses.find((entry) => isPrivateAddress(entry.address));
    if (priv) return { ok: false, why: `Host resolves to private IP address ${priv.address}` };
  }
  return { ok: true, addresses };
}

/**
 * The `connect.lookup` undici uses. It answers only from `pinned`, so a name
 * that was never validated cannot be connected to at all — including a name
 * that passed the check once and would resolve differently now.
 *
 * This is what closes the DNS-rebinding window: without it the name is resolved
 * twice, once by the validator and once by the runtime opening the socket, and
 * only the first answer is ever checked. A host that answers publicly during
 * validation and privately a moment later walks straight through.
 */
export function createPinnedLookup(pinned: PinnedHosts): LookupFunction {
  return (hostname, _options, callback) => {
    const addresses = pinned.get(hostname);
    if (!addresses || addresses.length === 0) {
      callback(new Error(`unpinned host: ${hostname}`), []);
      return;
    }
    callback(null, addresses);
  };
}

/**
 * Fetch a user-influenced URL with SSRF protection that also covers redirects.
 *
 * The previous implementation validated the URL once and then called
 * `fetch(url)` with default redirect following — so a `302 Location:
 * http://169.254.169.254/…` (or any redirect to an internal host) walked
 * straight past the check, which only ever covered the first URL. Here
 * redirects are followed by hand with `redirect: 'manual'` and every hop is
 * re-validated in full before we make the next request.
 *
 * The second half — DNS rebinding — is closed by the pinned dispatcher. The
 * name is resolved ONCE per hop, every address it answers with has to be
 * public, and undici may only connect to addresses from that answer
 * (`createPinnedLookup`). Check and connect therefore see the same address by
 * construction rather than by timing; a host that answers publicly during
 * validation and privately a moment later has nowhere to send us. This is why
 * the request goes through undici's `fetch` and not the global one: the global
 * `fetch` is bound to Node's own bundled copy of undici and rejects a
 * dispatcher from the userland package outright ("invalid onRequestStart
 * method").
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
  // Per call, not shared: the pin set holds exactly the hosts THIS call
  // validated, so nothing another call checked can be reached from here.
  const pinned: PinnedHosts = new Map();
  const dispatcher = new Agent({ connect: { lookup: createPinnedLookup(pinned) } });
  let handedOff = false;

  try {
    return await runSafeFetch(
      urlString,
      fetchOptions,
      validationOptions,
      pinned,
      dispatcher,
      () => {
        handedOff = true;
      }
    );
  } finally {
    if (handedOff) {
      // `close()` drains what is already in flight — a streaming body keeps
      // arriving in full (measured: 2 MiB over 8 chunks). `destroy()` here
      // would cut it off mid-download ("The client is destroyed").
      void dispatcher.close().catch(() => {});
    } else {
      void dispatcher.destroy();
    }
  }
}

async function runSafeFetch(
  urlString: string,
  fetchOptions: RequestInit,
  validationOptions: UrlValidationOptions,
  pinned: PinnedHosts,
  dispatcher: Agent,
  markHandedOff: () => void
): Promise<Response> {
  let currentUrl = urlString;
  let originalOrigin: string | null = null;
  let stripCredentials = false;

  for (let hop = 0; ; hop++) {
    const validation = await validateUrlForFetch(currentUrl, {
      ...validationOptions,
      // The resolution happens below, once, and the socket is pinned to it.
      // Letting the validator resolve as well would be a second, unrelated
      // lookup — precisely the gap this pinning closes.
      skipDnsCheck: true,
    });
    if (!validation.isValid || !validation.url) {
      throw new Error(`URL validation failed: ${validation.error}`);
    }

    const resolved = await resolvePinnedAddresses(validation.url.hostname, {
      allowPrivateIPs: validationOptions.allowPrivateIPs ?? false,
    });
    if (!resolved.ok) {
      throw new Error(`URL validation failed: ${resolved.why}`);
    }
    pinned.set(validation.url.hostname, resolved.addresses);

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
    // The header list is passed as pairs, not as a `Headers` instance: undici's
    // copy of that class is not the global one, and only the pairs are portable
    // between them.
    const response = await undiciFetch(validation.url.toString(), {
      ...(fetchOptions as UndiciRequestInit),
      headers: [...headers],
      redirect: 'manual',
      dispatcher,
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = isRedirect ? response.headers.get('location') : null;

    // A 3xx without a Location is not a redirect we can follow — hand it back.
    if (!isRedirect || !location) {
      markHandedOff();
      // The body is undici's Response, structurally the same object the global
      // `fetch` hands back (both are web streams from `node:stream/web`). The
      // cast is the boundary: callers keep the platform type they always had.
      return response as unknown as Response;
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
