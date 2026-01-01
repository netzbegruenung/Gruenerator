/**
 * Domain Utilities - Uses centralized config
 * @see config/domains.js for domain configuration
 */
import type { Request } from 'express';
import {
  PRIMARY_DOMAIN,
  PRIMARY_URL,
  BRAND,
  URLS
} from '../config/domains.js';

const ALLOWED_DOMAINS: string[] = [
  'gruenerator.de',
  'www.gruenerator.de',
  'beta.gruenerator.de',
  'www.beta.gruenerator.de',
  'gruenerator.at',
  'www.gruenerator.at',
  'gruenerator.eu',
  'www.gruenerator.eu',
  'gruenerator-test.de',
  'www.gruenerator-test.de',
  'gruenerator.netzbegruenung.verdigado.net',
  'www.gruenerator.netzbegruenung.verdigado.net',
  'gruenerator-test.netzbegruenung.verdigado.net',
  'www.gruenerator-test.netzbegruenung.verdigado.net',
  'xn--grenerator-z2a.de',
  'www.xn--grenerator-z2a.de',
  'beta.xn--grenerator-z2a.de',
  'www.xn--grenerator-z2a.de',
  'xn--grenerator-test-4pb.de',
  'www.xn--grenerator-test-4pb.de',
  'xn--grenerator-z2a.xn--netzbegrnung-dfb.verdigado.net',
  'www.xn--grenerator-z2a.xn--netzbegrnung-dfb.verdigado.net',
  'xn--grenerator-test-4pb.xn--netzbegrnung-dfb.verdigado.net',
  'www.xn--grenerator-test-4pb.xn--netzbegrnung-dfb.verdigado.net',
  'www.xn--grnerator-z2a.xn--netzbegrnung-dfb.verdigado.net'
];

const DEV_DOMAINS: string[] = [
  'localhost',
  '127.0.0.1'
];

export function getAllowedDomains(includeDevDomains = false): string[] {
  return includeDevDomains ? [...ALLOWED_DOMAINS, ...DEV_DOMAINS] : ALLOWED_DOMAINS;
}

export function getCorsOrigins(includeDevOrigins = false): string[] {
  const origins = ALLOWED_DOMAINS.map(domain => `https://${domain}`);

  if (includeDevOrigins) {
    origins.push(
      'http://localhost:3000',
      'https://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002'
    );
  }

  return origins;
}

export function getOriginDomain(req: Request): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    || req.headers.host
    || 'localhost:3000';
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
  return allDomains.some(allowed =>
    domainWithoutPort === allowed ||
    domainWithoutPort.endsWith('.' + allowed)
  );
}

export function buildDomainUrl(domain: string, path = '', isSecure = true): string {
  const protocol = isSecure ? 'https' : 'http';
  const normalizedPath = path.startsWith('/') ? path : (path ? '/' + path : '');
  return `${protocol}://${domain}${normalizedPath}`;
}

export function getLocaleFromDomain(domain: string): 'de-AT' | 'de-DE' {
  const domainLower = domain.toLowerCase();
  if (domainLower.includes('.at') || domainLower.includes('gruenerator.at')) {
    return 'de-AT';
  }
  return 'de-DE';
}

export {
  PRIMARY_DOMAIN,
  PRIMARY_URL,
  BRAND,
  URLS,
  ALLOWED_DOMAINS,
  DEV_DOMAINS
};
