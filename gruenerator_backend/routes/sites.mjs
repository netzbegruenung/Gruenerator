import express from 'express';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import authMiddlewareModule from '../middleware/authMiddleware.js';

const router = express.Router();
const db = getPostgresInstance();
const { requireAuth } = authMiddlewareModule;

const RESERVED_SUBDOMAINS = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'blog', 'shop', 'test', 'dev', 'staging'];

// Apply authentication middleware to all routes
router.use(requireAuth);

router.get('/my-site', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        const result = await db.query(
            'SELECT * FROM user_sites WHERE user_id = $1',
            [userId]
        );

        if (!result || result.length === 0) {
            return res.json({ site: null });
        }

        res.json({ site: result[0] });
    } catch (error) {
        console.error('Error fetching user site:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Site' });
    }
});

router.post('/create', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        const { subdomain, site_title, tagline, theme = 'gruene' } = req.body;

        if (!subdomain || !site_title) {
            return res.status(400).json({ error: 'Subdomain und Titel sind erforderlich' });
        }

        const subdomainLower = subdomain.toLowerCase().trim();
        if (!/^[a-z0-9-]+$/.test(subdomainLower)) {
            return res.status(400).json({ error: 'Subdomain darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten' });
        }

        if (RESERVED_SUBDOMAINS.includes(subdomainLower)) {
            return res.status(400).json({ error: 'Diese Subdomain ist reserviert' });
        }

        const existingCheck = await db.query(
            'SELECT id FROM user_sites WHERE user_id = $1',
            [userId]
        );

        if (existingCheck && existingCheck.length > 0) {
            return res.status(400).json({ error: 'Sie haben bereits eine Site erstellt' });
        }

        const result = await db.query(
            `INSERT INTO user_sites (user_id, subdomain, site_title, tagline, theme, is_published)
             VALUES ($1, $2, $3, $4, $5, false)
             RETURNING *`,
            [userId, subdomainLower, site_title, tagline, theme]
        );

        res.json({ site: result[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Diese Subdomain ist bereits vergeben' });
        }
        console.error('Error creating site:', error);
        res.status(500).json({ error: 'Fehler beim Erstellen der Site' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        const { id } = req.params;
        const updates = req.body;

        const allowedFields = [
            'site_title', 'tagline', 'bio', 'contact_email',
            'social_links', 'accent_color',
            'profile_image', 'background_image', 'sections', 'meta_description',
            'meta_keywords'
        ];

        const updateFields = [];
        const values = [];
        let paramCounter = 1;

        for (const field of allowedFields) {
            if (updates.hasOwnProperty(field)) {
                updateFields.push(`${field} = $${paramCounter}`);
                values.push(updates[field]);
                paramCounter++;
            }
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'Keine Felder zum Aktualisieren' });
        }

        values.push(id, userId);

        const result = await db.query(
            `UPDATE user_sites
             SET ${updateFields.join(', ')}
             WHERE id = $${paramCounter} AND user_id = $${paramCounter + 1}
             RETURNING *`,
            values
        );

        if (!result || result.length === 0) {
            return res.status(404).json({ error: 'Site nicht gefunden' });
        }

        res.json({ site: result[0] });
    } catch (error) {
        console.error('Error updating site:', error);
        res.status(500).json({ error: 'Fehler beim Aktualisieren der Site' });
    }
});

router.post('/:id/publish', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        const { id } = req.params;
        const { publish } = req.body;

        const result = await db.query(
            `UPDATE user_sites
             SET is_published = $1, last_published = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE last_published END
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
            [publish, id, userId]
        );

        if (!result || result.length === 0) {
            return res.status(404).json({ error: 'Site nicht gefunden' });
        }

        res.json({ site: result[0] });
    } catch (error) {
        console.error('Error publishing site:', error);
        res.status(500).json({ error: 'Fehler beim Veröffentlichen der Site' });
    }
});

router.get('/check-subdomain', async (req, res) => {
    try {
        const { subdomain } = req.query;

        if (!subdomain) {
            return res.status(400).json({ error: 'Subdomain ist erforderlich' });
        }

        const subdomainLower = subdomain.toLowerCase().trim();

        if (!/^[a-z0-9-]+$/.test(subdomainLower)) {
            return res.json({ available: false, reason: 'invalid' });
        }

        if (RESERVED_SUBDOMAINS.includes(subdomainLower)) {
            return res.json({ available: false, reason: 'reserved' });
        }

        const result = await db.query(
            'SELECT id FROM user_sites WHERE subdomain = $1',
            [subdomainLower]
        );

        res.json({ available: !result || result.length === 0 });
    } catch (error) {
        console.error('Error checking subdomain:', error);
        res.status(500).json({ error: 'Fehler beim Prüfen der Subdomain' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Nicht authentifiziert' });
        }

        const { id } = req.params;

        const result = await db.query(
            'DELETE FROM user_sites WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );

        if (!result || result.length === 0) {
            return res.status(404).json({ error: 'Site nicht gefunden' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting site:', error);
        res.status(500).json({ error: 'Fehler beim Löschen der Site' });
    }
});

router.get('/themes', async (req, res) => {
    const themes = [
        {
            id: 'gruene',
            name: 'Grüne Classic',
            description: 'Klassisches Design in Grünen-Farben',
            primaryColor: '#46962b',
            secondaryColor: '#64a70b'
        },
        {
            id: 'modern',
            name: 'Modern Minimal',
            description: 'Modernes, minimalistisches Design',
            primaryColor: '#2c3e50',
            secondaryColor: '#3498db'
        },
        {
            id: 'professional',
            name: 'Professional',
            description: 'Professionelles Business-Design',
            primaryColor: '#34495e',
            secondaryColor: '#95a5a6'
        }
    ];

    res.json({ themes });
});

export default router;