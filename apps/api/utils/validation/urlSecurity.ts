/**
 * URL Security Utilities
 * SSRF protection and URL validation
 */

import { URL } from 'url';
import * as dns from 'dns';
import { promisify } from 'util';

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

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(range => range.test(ip));
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
  if (ipMatch && !allowPrivateIPs && isPrivateIP(hostname)) {
    return { isValid: false, error: 'Private IP addresses are not allowed' };
  }

  if (!skipDnsCheck && !ipMatch && !allowPrivateIPs) {
    try {
      const { address } = await dnsLookup(hostname);
      if (isPrivateIP(address)) {
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
  if (ipMatch && !allowPrivateIPs && isPrivateIP(hostname)) {
    return { isValid: false, error: 'Private IP addresses are not allowed' };
  }

  return { isValid: true, url };
}

export async function safeFetch(
  urlString: string,
  fetchOptions: RequestInit = {},
  validationOptions: UrlValidationOptions = {}
): Promise<Response> {
  const validation = await validateUrlForFetch(urlString, validationOptions);
  if (!validation.isValid) {
    throw new Error(`URL validation failed: ${validation.error}`);
  }
  return fetch(urlString, fetchOptions);
}

export default {
  validateUrlForFetch,
  validateUrlSync,
  safeFetch,
};
