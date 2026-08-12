/**
 * Centralized Domain Configuration
 *
 * To change the primary domain:
 * 1. Update PRIMARY_DOMAIN below (or set PRIMARY_DOMAIN env var)
 * 2. Update frontend .env (VITE_PRIMARY_DOMAIN)
 * 3. Update Keycloak & nginx (external configs)
 */

import { domainToASCII } from 'node:url';

import { env } from './env.js';

export const PRIMARY_DOMAIN = env.PRIMARY_DOMAIN;
export const PRIMARY_URL = `https://${PRIMARY_DOMAIN}`;

/**
 * Umlaut-Domains, aus denen die A-Label (`xn--…`) berechnet werden.
 *
 * Nicht von Hand eintragen: Punycode ist keine Zeichenersetzung, sondern eine
 * Kodierung über das ganze Label — die vorherigen handgeschriebenen Einträge
 * dekodierten zu `grenïerator-test.de`, `netzbegrnungë.verdigado.net` und
 * einmal zu gar nichts (`xn--grenerator-z2a.de` ist kein gültiges A-Label, die
 * WHATWG-URL-Analyse lehnt es ab). Der Browser schickt `Origin` immer als
 * A-Label, also stand die echte Umlaut-Domain nie in der Liste und wurde
 * blockiert.
 */
const UNICODE_DOMAINS: string[] = [
  'grünerator.de',
  'www.grünerator.de',
  'beta.grünerator.de',
  'grünerator-test.de',
  'www.grünerator-test.de',
  'grünerator.netzbegrünung.verdigado.net',
  'www.grünerator.netzbegrünung.verdigado.net',
  'grünerator-test.netzbegrünung.verdigado.net',
  'www.grünerator-test.netzbegrünung.verdigado.net',
];

/**
 * Beide Schreibweisen: der `Origin`-Header trägt das A-Label, während
 * `x-forwarded-host` und Konfigurationswerte auch die U-Label-Form führen
 * können. `domainToASCII` gibt bei ungültiger Eingabe '' zurück — das wird
 * verworfen, damit ein Tippfehler nicht als leerer Eintrag mitläuft.
 */
const IDN_DOMAINS: string[] = UNICODE_DOMAINS.flatMap((domain) => {
  const ascii = domainToASCII(domain);
  return ascii ? [domain, ascii] : [domain];
});

export const ALLOWED_DOMAINS: string[] = [
  PRIMARY_DOMAIN,
  `www.${PRIMARY_DOMAIN}`,
  `beta.${PRIMARY_DOMAIN}`,
  'gruenerator.de',
  'www.gruenerator.de',
  'beta.gruenerator.de',
  'www.beta.gruenerator.de',
  'beta.gruenerator.eu',
  'www.beta.gruenerator.eu',
  'doku.beta.gruenerator.eu',
  'sites.beta.gruenerator.eu',
  'gruenerator.at',
  'www.gruenerator.at',
  'gruen-o-mat.eu',
  'www.gruen-o-mat.eu',
  'gruenerator.eu',
  'www.gruenerator.eu',
  'gruenerator-test.de',
  'www.gruenerator-test.de',
  'gruenerator.netzbegruenung.verdigado.net',
  'www.gruenerator.netzbegruenung.verdigado.net',
  'gruenerator-test.netzbegruenung.verdigado.net',
  'www.gruenerator-test.netzbegruenung.verdigado.net',
  ...IDN_DOMAINS,
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

const authBase = env.AUTH_BASE_URL ?? `${PRIMARY_URL}/api`;

export const URLS: UrlConfig = {
  base: env.BASE_URL ?? PRIMARY_URL,
  authBase,
  callback: `${authBase}/auth/callback`,
};

export function isAllowedDomain(domain: string | undefined): boolean {
  if (!domain) return false;
  const domainWithoutPort = domain.split(':')[0];
  const allDomains = [...ALLOWED_DOMAINS, ...(env.NODE_ENV !== 'production' ? DEV_DOMAINS : [])];
  return allDomains.some(
    (allowed) => domainWithoutPort === allowed || domainWithoutPort.endsWith('.' + allowed)
  );
}

export function buildUrl(path = ''): string {
  const normalizedPath = path.startsWith('/') ? path : path ? '/' + path : '';
  return `${PRIMARY_URL}${normalizedPath}`;
}
