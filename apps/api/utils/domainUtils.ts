/**
 * Domain Utilities - Uses centralized config
 * @see config/domains.js for domain configuration
 */
import type { Request } from 'express';
import {
  PRIMARY_DOMAIN,
  PRIMARY_URL,
  BRAND,
  URLS,
  ALLOWED_DOMAINS,
  DEV_DOMAINS,
} from '../config/domains.js';

export function getAllowedDomains(includeDevDomains = false): string[] {
  return includeDevDomains ? [...ALLOWED_DOMAINS, ...DEV_DOMAINS] : [...ALLOWED_DOMAINS];
}

export function getCorsOrigins(includeDevOrigins = false): string[] {
  const origins = ALLOWED_DOMAINS.map((domain) => `https://${domain}`);

  if (includeDevOrigins) {
    origins.push(
      'http://localhost:3000',
      'https://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3210',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3003',
      'http://127.0.0.1:3210'
    );
  }

  return origins;
}

export function getOriginDomain(req: Request): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ||
    req.headers.host ||
    'localhost:3000';
  return host;
}

export function getOriginDomainWithoutPort(req: Request): string {
  const domain = getOriginDomain(req);
  return domain.split(':')[0];
}

export function isAllowedDomain(domain: string | undefined): boolean {
  if (!domain) return false;
  const domainWithoutPort = domain.split(':')[0];
  const allDomains = [...ALLOWED_DOMAINS, ...DEV_DOMAINS];
  return allDomains.some(
    (allowed) => domainWithoutPort === allowed || domainWithoutPort.endsWith('.' + allowed)
  );
}

export function buildDomainUrl(domain: string, path = '', isSecure = true): string {
  const protocol = isSecure ? 'https' : 'http';
  const normalizedPath = path.startsWith('/') ? path : path ? '/' + path : '';
  return `${protocol}://${domain}${normalizedPath}`;
}

export function getLocaleFromDomain(domain: string): 'de-AT' | 'de-DE' {
  const domainLower = domain.toLowerCase();
  if (domainLower.includes('.at') || domainLower.includes('gruenerator.at')) {
    return 'de-AT';
  }
  return 'de-DE';
}

export { PRIMARY_DOMAIN, PRIMARY_URL, BRAND, URLS, ALLOWED_DOMAINS, DEV_DOMAINS };
