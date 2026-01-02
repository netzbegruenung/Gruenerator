/**
 * Centralized Domain Configuration (Frontend)
 *
 * To change: Update VITE_PRIMARY_DOMAIN in .env.production
 */

export const PRIMARY_DOMAIN = import.meta.env.VITE_PRIMARY_DOMAIN || 'gruenerator.de';
export const PRIMARY_URL = `https://${PRIMARY_DOMAIN}`;
export const WWW_URL = `https://www.${PRIMARY_DOMAIN}`;

export interface Brand {
  name: string;
  url: string;
  wwwUrl: string;
}

export const BRAND: Brand = {
  name: 'Grünerator',
  url: PRIMARY_URL,
  wwwUrl: WWW_URL,
};

/**
 * Build a full URL with the primary domain
 */
export const buildUrl = (path = ''): string => {
  const normalizedPath = path.startsWith('/') ? path : (path ? '/' + path : '');
  return `${PRIMARY_URL}${normalizedPath}`;
};
