/**
 * Sites Controller - API endpoints for user site management
 */

import express, { type Response, type Router, type RequestHandler } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';

import {
  RESERVED_SUBDOMAINS,
  AVAILABLE_THEMES,
  type SitesRequest,
  type UserSite,
  type CreateSiteBody,
  type UpdateSiteBody,
  type PublishBody,
  type CheckSubdomainQuery,
} from './types.js';

type SitesHandler = RequestHandler<any, any, any, any>;

const log = createLogger('sites');
const router: Router = express.Router();
const db = getPostgresInstance();

const ALLOWED_UPDATE_FIELDS = [
  'site_title',
  'tagline',
  'bio',
  'contact_email',
  'social_links',
  'accent_color',
  'profile_image',
  'background_image',
  'sections',
  'meta_description',
  'meta_keywords',
];

/**
 * GET /public/:subdomain - Get public site data (no auth required)
 */
router.get('/public/:subdomain', (async (
  req: SitesRequest<{ subdomain: string }>,
  res: Response
): Promise<void> => {
  try {
    const { subdomain } = req.params;
    const subdomainLower = subdomain.toLowerCase().trim();

    const result = (await db.query(
      'SELECT * FROM user_sites WHERE subdomain = $1 AND is_published = true',
      [subdomainLower]
    )) as unknown as UserSite[];

    if (!result || result.length === 0) {
      res.status(404).json({ error: 'Site nicht gefunden oder nicht veröffentlicht' });
      return;
    }

    res.json({ site: result[0] });
  } catch (error) {
    log.error('Error fetching public site:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Site' });
  }
}) as SitesHandler);

// Apply authentication to all remaining routes
router.use(requireAuth);

/**
 * GET /my-site - Get current user's site
 */
router.get('/my-site', (async (req: SitesRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      return;
    }

    const result = (await db.query('SELECT * FROM user_sites WHERE user_id = $1', [
      userId,
    ])) as unknown as UserSite[];

    if (!result || result.length === 0) {
      res.json({ site: null });
      return;
    }

    res.json({ site: result[0] });
  } catch (error) {
    log.error('Error fetching user site:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Site' });
  }
}) as SitesHandler);

/**
 * POST /create - Create a new site
 */
router.post('/create', (async (req: SitesRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      return;
    }

    const { subdomain, site_title, tagline, theme = 'gruene' } = req.body as CreateSiteBody;

    if (!subdomain || !site_title) {
      res.status(400).json({ error: 'Subdomain und Titel sind erforderlich' });
      return;
    }

    const subdomainLower = subdomain.toLowerCase().trim();
    if (!/^[a-z0-9-]+$/.test(subdomainLower)) {
      res
        .status(400)
        .json({ error: 'Subdomain darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten' });
      return;
    }

    if (RESERVED_SUBDOMAINS.includes(subdomainLower)) {
      res.status(400).json({ error: 'Diese Subdomain ist reserviert' });
      return;
    }

    const existingCheck = (await db.query('SELECT id FROM user_sites WHERE user_id = $1', [
      userId,
    ])) as unknown as { id: string }[];

    if (existingCheck && existingCheck.length > 0) {
      res.status(400).json({ error: 'Sie haben bereits eine Site erstellt' });
      return;
    }

    const result = (await db.query(
      `INSERT INTO user_sites (user_id, subdomain, site_title, tagline, theme, is_published)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [userId, subdomainLower, site_title, tagline, theme]
    )) as unknown as UserSite[];

    res.json({ site: result[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Diese Subdomain ist bereits vergeben' });
      return;
    }
    log.error('Error creating site:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen der Site' });
  }
}) as SitesHandler);

/**
 * PUT /:id - Update a site
 */
router.put('/:id', (async (req: SitesRequest<{ id: string }>, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      return;
    }

    const { id } = req.params;
    const updates = req.body as UpdateSiteBody;

    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramCounter = 1;

    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        updateFields.push(`${field} = $${paramCounter}`);
        values.push((updates as Record<string, unknown>)[field]);
        paramCounter++;
      }
    }

    if (updateFields.length === 0) {
      res.status(400).json({ error: 'Keine Felder zum Aktualisieren' });
      return;
    }

    values.push(id, userId);

    const result = (await db.query(
      `UPDATE user_sites
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCounter} AND user_id = $${paramCounter + 1}
       RETURNING *`,
      values
    )) as unknown as UserSite[];

    if (!result || result.length === 0) {
      res.status(404).json({ error: 'Site nicht gefunden' });
      return;
    }

    res.json({ site: result[0] });
  } catch (error) {
    log.error('Error updating site:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Site' });
  }
}) as SitesHandler);

/**
 * POST /:id/publish - Publish or unpublish a site
 */
router.post('/:id/publish', (async (
  req: SitesRequest<{ id: string }>,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      return;
    }

    const { id } = req.params;
    const { publish } = req.body as PublishBody;

    const result = (await db.query(
      `UPDATE user_sites
       SET is_published = $1, last_published = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE last_published END
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [publish, id, userId]
    )) as unknown as UserSite[];

    if (!result || result.length === 0) {
      res.status(404).json({ error: 'Site nicht gefunden' });
      return;
    }

    res.json({ site: result[0] });
  } catch (error) {
    log.error('Error publishing site:', error);
    res.status(500).json({ error: 'Fehler beim Veröffentlichen der Site' });
  }
}) as SitesHandler);

/**
 * GET /check-subdomain - Check if subdomain is available
 */
router.get('/check-subdomain', (async (req: SitesRequest, res: Response): Promise<void> => {
  try {
    const { subdomain } = req.query as CheckSubdomainQuery;

    if (!subdomain) {
      res.status(400).json({ available: false, error: 'Subdomain ist erforderlich' });
      return;
    }

    const subdomainLower = subdomain.toLowerCase().trim();

    if (!/^[a-z0-9-]+$/.test(subdomainLower)) {
      res.json({ available: false, reason: 'invalid' });
      return;
    }

    if (RESERVED_SUBDOMAINS.includes(subdomainLower)) {
      res.json({ available: false, reason: 'reserved' });
      return;
    }

    const result = (await db.query('SELECT id FROM user_sites WHERE subdomain = $1', [
      subdomainLower,
    ])) as unknown as { id: string }[];

    res.json({ available: !result || result.length === 0 });
  } catch (error) {
    log.error('Error checking subdomain:', error);
    res.status(500).json({ available: false, error: 'Fehler beim Prüfen der Subdomain' });
  }
}) as SitesHandler);

/**
 * DELETE /:id - Delete a site
 */
router.delete('/:id', (async (req: SitesRequest<{ id: string }>, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
      return;
    }

    const { id } = req.params;

    const result = (await db.query(
      'DELETE FROM user_sites WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    )) as unknown as { id: string }[];

    if (!result || result.length === 0) {
      res.status(404).json({ success: false, error: 'Site nicht gefunden' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting site:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Löschen der Site' });
  }
}) as SitesHandler);

/**
 * GET /themes - Get available themes
 */
router.get('/themes', ((_req: SitesRequest, res: Response): void => {
  res.json({ themes: AVAILABLE_THEMES });
}) as SitesHandler);

export default router;
