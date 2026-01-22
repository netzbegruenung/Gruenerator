/**
 * Centralized Domain Configuration
 *
 * To change the primary domain:
 * 1. Update PRIMARY_DOMAIN below (or set PRIMARY_DOMAIN env var)
 * 2. Update frontend .env (VITE_PRIMARY_DOMAIN)
 * 3. Update Keycloak & nginx (external configs)
 */

export const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || 'gruenerator.eu';
export const PRIMARY_URL = `https://${PRIMARY_DOMAIN}`;

export const ALLOWED_DOMAINS: string[] = [
  PRIMARY_DOMAIN,
  `www.${PRIMARY_DOMAIN}`,
  `beta.${PRIMARY_DOMAIN}`,
  'gruenerator.de',
  'www.gruenerator.de',
  'beta.gruenerator.de',
  'gruenerator.at',
  'www.gruenerator.at',
  'gruenerator.eu',
  'www.gruenerator.eu',
  'localhost',
  '127.0.0.1',
];

export const DEV_DOMAINS: string[] = ['localhost', '127.0.0.1'];

export interface BrandInfo {
  name: string;
  email: string;
  devEmail: string;
  botUserAgent: string;
}

export const BRAND: BrandInfo = {
  name: 'Grünerator',
  email: `info@${PRIMARY_DOMAIN}`,
  devEmail: `dev@${PRIMARY_DOMAIN}`,
  botUserAgent: `Gruenerator-Bot/1.0 (+${PRIMARY_URL})`,
};

export interface UrlConfig {
  base: string;
  authBase: string;
  callback: string;
}

export const URLS: UrlConfig = {
  base: process.env.BASE_URL || PRIMARY_URL,
  authBase: process.env.AUTH_BASE_URL || `${PRIMARY_URL}/api`,
  callback: `${process.env.AUTH_BASE_URL || PRIMARY_URL}/api/auth/callback`,
};

export function isAllowedDomain(domain: string | undefined): boolean {
  if (!domain) return false;
  const domainWithoutPort = domain.split(':')[0];
  const allDomains = [
    ...ALLOWED_DOMAINS,
    ...(process.env.NODE_ENV !== 'production' ? DEV_DOMAINS : []),
  ];
  return allDomains.some(
    (allowed) => domainWithoutPort === allowed || domainWithoutPort.endsWith('.' + allowed)
  );
}

export function buildUrl(path = ''): string {
  const normalizedPath = path.startsWith('/') ? path : path ? '/' + path : '';
  return `${PRIMARY_URL}${normalizedPath}`;
}
