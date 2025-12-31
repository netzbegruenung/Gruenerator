import { getPostgresInstance } from '../database/services/PostgresService.js';

const db = getPostgresInstance();

export const getSubdomain = (host) => {
    if (!host) {
        console.log('[SubdomainHandler] No host provided');
        return null;
    }

    console.log(`[SubdomainHandler] Processing host: ${host}`);
    const parts = host.split('.');

    if (parts.length >= 3) {
        const subdomain = parts[0];
        console.log(`[SubdomainHandler] Extracted subdomain: ${subdomain}`);

        if (subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'app' && subdomain !== 'beta') {
            console.log(`[SubdomainHandler] ✓ Subdomain "${subdomain}" will be treated as user site`);
            return subdomain;
        } else {
            console.log(`[SubdomainHandler] ✗ Subdomain "${subdomain}" is reserved, treating as main app`);
        }
    } else {
        console.log(`[SubdomainHandler] Host has ${parts.length} parts, not a subdomain`);
    }

    return null;
};

export const subdomainHandler = async (req, res, next) => {
    try {
        const host = req.get('host');
        const subdomain = getSubdomain(host);

        if (subdomain) {
            console.log(`[SubdomainHandler] Looking up user site for subdomain: ${subdomain}`);
            req.subdomain = subdomain;

            const result = await db.query(
                'SELECT * FROM user_sites WHERE subdomain = $1 AND is_published = true',
                [subdomain]
            );

            if (result.rows.length > 0) {
                console.log(`[SubdomainHandler] ✓ Found published site for subdomain: ${subdomain}`);
                req.siteData = result.rows[0];

                await db.query(
                    'UPDATE user_sites SET visit_count = visit_count + 1 WHERE id = $1',
                    [result.rows[0].id]
                );
            } else {
                console.log(`[SubdomainHandler] ✗ No published site found for subdomain: ${subdomain}`);
            }
        }

        next();
    } catch (error) {
        console.error('[SubdomainHandler] Error:', error);
        next();
    }
};