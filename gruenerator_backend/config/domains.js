/**
 * Centralized Domain Configuration
 *
 * To change the primary domain:
 * 1. Update PRIMARY_DOMAIN below (or set PRIMARY_DOMAIN env var)
 * 2. Update frontend .env (VITE_PRIMARY_DOMAIN)
 * 3. Update Keycloak & nginx (external configs)
 */

const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || 'gruenerator.de';
const PRIMARY_URL = `https://${PRIMARY_DOMAIN}`;

// All domains that should be accepted (not redirected)
const ALLOWED_DOMAINS = [
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
  '127.0.0.1'
];

// Development domains (only in non-production)
const DEV_DOMAINS = [
  'localhost',
  '127.0.0.1'
];

// Brand information
const BRAND = {
  name: 'Grünerator',
  email: `info@${PRIMARY_DOMAIN}`,
  devEmail: `dev@${PRIMARY_DOMAIN}`,
  botUserAgent: `Gruenerator-Bot/1.0 (+${PRIMARY_URL})`,
};

// URLs
const URLS = {
  base: process.env.BASE_URL || PRIMARY_URL,
  authBase: process.env.AUTH_BASE_URL || `${PRIMARY_URL}/api`,
  callback: `${process.env.AUTH_BASE_URL || PRIMARY_URL}/api/auth/callback`,
};

/**
 * Check if a domain is allowed
 * @param {string} domain - Domain to check (may include port)
 * @returns {boolean}
 */
function isAllowedDomain(domain) {
  if (!domain) return false;
  const domainWithoutPort = domain.split(':')[0];
  const allDomains = [...ALLOWED_DOMAINS, ...(process.env.NODE_ENV !== 'production' ? DEV_DOMAINS : [])];
  return allDomains.some(allowed =>
    domainWithoutPort === allowed ||
    domainWithoutPort.endsWith('.' + allowed)
  );
}

/**
 * Build a full URL with the primary domain
 * @param {string} path - Path to append
 * @returns {string}
 */
function buildUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : (path ? '/' + path : '');
  return `${PRIMARY_URL}${normalizedPath}`;
}

module.exports = {
  PRIMARY_DOMAIN,
  PRIMARY_URL,
  ALLOWED_DOMAINS,
  DEV_DOMAINS,
  BRAND,
  URLS,
  isAllowedDomain,
  buildUrl
};
