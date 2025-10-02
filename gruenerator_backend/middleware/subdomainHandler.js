import { getPostgresInstance } from '../database/services/PostgresService.js';

const db = getPostgresInstance();

export const getSubdomain = (host) => {
    if (!host) return null;

    const parts = host.split('.');

    if (parts.length >= 3) {
        const subdomain = parts[0];
        if (subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'app') {
            return subdomain;
        }
    }

    return null;
};

export const subdomainHandler = async (req, res, next) => {
    try {
        const host = req.get('host');
        const subdomain = getSubdomain(host);

        if (subdomain) {
            req.subdomain = subdomain;

            const result = await db.query(
                'SELECT * FROM user_sites WHERE subdomain = $1 AND is_published = true',
                [subdomain]
            );

            if (result.rows.length > 0) {
                req.siteData = result.rows[0];

                await db.query(
                    'UPDATE user_sites SET visit_count = visit_count + 1 WHERE id = $1',
                    [result.rows[0].id]
                );
            }
        }

        next();
    } catch (error) {
        console.error('Subdomain handler error:', error);
        next();
    }
};