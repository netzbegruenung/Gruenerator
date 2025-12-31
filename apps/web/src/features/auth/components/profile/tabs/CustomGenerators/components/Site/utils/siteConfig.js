/**
 * Get the sites domain based on environment
 * Development: localhost:3000 (frontend dev server)
 * Production: grsites.de
 */
export const getSitesDomain = () => {
    const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
    return isDevelopment ? 'localhost:3000' : 'grsites.de';
};

/**
 * Get the protocol based on environment
 */
export const getSitesProtocol = () => {
    const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
    return isDevelopment ? 'http' : 'https';
};

/**
 * Get the full site URL for a subdomain
 * In development, we can't use subdomains, so we just link to localhost
 * In production, we use the subdomain.grsites.de format
 */
export const getSiteUrl = (subdomain) => {
    const protocol = getSitesProtocol();
    const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';

    if (isDevelopment) {
        // In dev, just link to localhost (no subdomain support in dev)
        // Users can test by accessing http://subdomain.localhost:3001 if they set up /etc/hosts
        return `${protocol}://localhost:3000`;
    }

    return `${protocol}://${subdomain}.grsites.de`;
};