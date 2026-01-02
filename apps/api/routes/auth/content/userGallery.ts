/**
 * User gallery and database listing routes
 * Handles unified gallery, categories, and content type listings
 */

import express, { Router, Response } from 'express';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';
import type { AuthRequest } from '../types.js';

const log = createLogger('userGallery');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Unified Database Gallery
// ============================================================================

router.get('/database', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      searchTerm = '',
      searchMode = 'title',
      category,
      types,
      onlyExamples = 'true',
      status = 'published',
      limit = '200'
    } = req.query;

    const typeList = types
      ? String(types)
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
      : [];

    if (searchTerm && String(searchTerm).trim().length > 0) {
      const raw = String(searchTerm).trim();
      const likeTerm = raw.replace(/'/g, "''");
      const escapedRegex = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''");
      const patternExact = `E'\\m${escapedRegex}\\M'`;
      const patternPrefix = `E'\\m${escapedRegex}'`;

      const conditions: string[] = [];
      if (status) conditions.push(`status = '${String(status).replace(/'/g, "''")}'`);
      if (onlyExamples === 'true') conditions.push(`is_example = true`);
      if (typeList.length > 0) {
        const typeIn = typeList.map(t => `'${t.replace(/'/g, "''")}'`).join(',');
        conditions.push(`type IN (${typeIn})`);
      }
      if (category && category !== 'all') {
        const catJson = `[\"${String(category).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}\"]`;
        conditions.push(`categories @> '${catJson.replace(/'/g, "''")}'::jsonb`);
      }

      const searchOr = `(
        title ILIKE '%${likeTerm}%' OR
        description ILIKE '%${likeTerm}%' OR
        content_data->>'content' ILIKE '%${likeTerm}%' OR
        content_data->>'caption' ILIKE '%${likeTerm}%' OR
        content_data->>'text' ILIKE '%${likeTerm}%'
      )`;

      conditions.push(searchOr);

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `
        SELECT
          id, type, title, description, content_data, categories, tags, created_at, status, is_example, is_private,
          CASE
            WHEN (title ~* ${patternExact} OR description ~* ${patternExact} OR content_data->>'content' ~* ${patternExact} OR content_data->>'caption' ~* ${patternExact} OR content_data->>'text' ~* ${patternExact}) THEN 0
            WHEN (title ~* ${patternPrefix} OR description ~* ${patternPrefix} OR content_data->>'content' ~* ${patternPrefix} OR content_data->>'caption' ~* ${patternPrefix} OR content_data->>'text' ~* ${patternPrefix}) THEN 1
            WHEN ${searchOr} THEN 2
            ELSE 3
          END AS rank_bucket
        FROM database
        ${where}
        ORDER BY rank_bucket ASC, created_at DESC
        LIMIT ${parseInt(limit as string)}
      `;

      try {
        const postgres = getPostgresInstance();
        await postgres.ensureInitialized();
        const rankedData = await postgres.query(sql);
        res.json({ success: true, data: rankedData || [] });
        return;
      } catch (sqlError) {
        log.warn('[Gallery] Direct SQL query failed, falling back to simpler query:', (sqlError as Error)?.message);
      }
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (onlyExamples === 'true') {
      conditions.push(`is_example = $${paramIndex++}`);
      params.push(true);
    }
    if (typeList.length > 0) {
      conditions.push(`type = ANY($${paramIndex++})`);
      params.push(typeList);
    }
    if (category && category !== 'all') {
      conditions.push(`categories @> $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([category]));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const simpleQuery = `
      SELECT id, type, title, description, content_data, categories, tags, created_at, status, is_example, is_private
      FROM database
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(parseInt(limit as string));

    const data = await postgres.query(simpleQuery, params, { table: 'database' });

    let responseData = data || [];
    if (searchTerm && String(searchTerm).trim().length > 0) {
      const q = String(searchTerm).trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRe = new RegExp(`\\b${escaped}\\b`, 'i');
      const prefixRe = new RegExp(`\\b${escaped}\\w+`, 'i');
      const substringRe = new RegExp(escaped, 'i');

      const scoreItem = (row: any) => {
        const textParts = [
          row?.title || '',
          row?.description || '',
          row?.content_data?.content || '',
          row?.content_data?.caption || '',
          row?.content_data?.text || ''
        ];
        const combined = textParts.join(' ');
        if (wordRe.test(combined)) return 0;
        if (prefixRe.test(combined)) return 1;
        if (substringRe.test(combined)) return 2;
        return 3;
      };

      responseData = responseData
        .map((r: any) => ({ r, s: scoreItem(r) }))
        .sort((a: any, b: any) => {
          if (a.s !== b.s) return a.s - b.s;
          const at = new Date(a.r.created_at).getTime();
          const bt = new Date(b.r.created_at).getTime();
          return bt - at;
        })
        .map((x: any) => x.r);
    }

    res.json({ success: true, data: responseData });
  } catch (err) {
    const error = err as Error;
    log.error('[Gallery] /database GET error:', error);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der Datenbank-Inhalte', details: error.message, data: [] });
  }
});

// ============================================================================
// Anträge Gallery
// ============================================================================

router.get('/antraege-categories', ensureAuthenticated as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const data = await postgres.query(
      'SELECT categories FROM database WHERE type = $1 AND status = $2 AND is_private = $3',
      ['antrag', 'published', false],
      { table: 'database' }
    );

    const allCategories = (data || [])
      .flatMap((row: any) => Array.isArray(row.categories) ? row.categories : [])
      .filter(Boolean);

    const unique = [...new Set(allCategories)].sort();
    const categories = unique.map(c => ({ id: c, label: c }));

    res.json({ success: true, categories });
  } catch (err) {
    const error = err as Error;
    log.error('[Gallery] /antraege-categories error:', error);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der Kategorien', details: error.message });
  }
});

router.get('/antraege', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { searchTerm = '', searchMode = 'title', categoryId } = req.query;

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const conditions = ['type = $1', 'status = $2', 'is_private = $3'];
    const params: any[] = ['antrag', 'published', false];
    let paramIndex = 4;

    if (categoryId && categoryId !== 'all') {
      conditions.push(`categories @> $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([categoryId]));
    }

    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${String(searchTerm).trim()}%`;
      if (searchMode === 'fulltext') {
        conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        params.push(term);
      } else {
        conditions.push(`title ILIKE $${paramIndex}`);
        params.push(term);
      }
    }

    const query = `
      SELECT id, title, description, tags, categories, created_at
      FROM database
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const data = await postgres.query(query, params, { table: 'database' });

    res.json({ success: true, antraege: data || [] });
  } catch (err) {
    const error = err as Error;
    log.error('[Gallery] /antraege GET error:', error);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der Anträge', details: error.message, antraege: [] });
  }
});

// ============================================================================
// Custom Generators Gallery
// ============================================================================

router.get('/custom-generators', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { searchTerm = '', category } = req.query;

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const conditions = ['is_active = true'];
    const params: any[] = [];
    let paramIndex = 1;

    if (category === 'own') {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${String(searchTerm).trim()}%`;
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(term);
    }

    const query = `
      SELECT id, name, slug, description, created_at, user_id
      FROM custom_generators
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const data = await postgres.query(query, params, { table: 'custom_generators' });

    const generators = (data || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      description: g.description,
      created_at: g.created_at
    }));

    res.json({ success: true, generators });
  } catch (err) {
    const error = err as Error;
    log.error('[Gallery] /custom-generators GET error:', error);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der Grüneratoren', details: error.message, generators: [] });
  }
});

// ============================================================================
// PR Texts Gallery
// ============================================================================

router.get('/pr-texts', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { searchTerm = '', searchMode = 'title', categoryId } = req.query;

    const prTypes = ['instagram', 'facebook', 'twitter', 'linkedin', 'pressemitteilung', 'pr_text'];

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const conditions = ['type = ANY($1)', 'status = $2', 'is_example = $3'];
    const params: any[] = [prTypes, 'published', true];
    let paramIndex = 4;

    if (categoryId && categoryId !== 'all') {
      if (prTypes.includes(categoryId as string)) {
        conditions.push(`type = $${paramIndex++}`);
        params.push(categoryId);
      } else {
        conditions.push(`categories @> $${paramIndex++}::jsonb`);
        params.push(JSON.stringify([categoryId]));
      }
    }

    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${String(searchTerm).trim()}%`;
      if (searchMode === 'fulltext') {
        conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        params.push(term);
      } else {
        conditions.push(`title ILIKE $${paramIndex}`);
        params.push(term);
      }
    }

    const query = `
      SELECT id, title, description, content_data, type, categories, tags, created_at
      FROM database
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const data = await postgres.query(query, params, { table: 'database' });

    const results = (data || []).map((row: any) => {
      let content = '';
      if (row?.content_data?.content) content = row.content_data.content;
      else if (row?.content_data?.caption) content = row.content_data.caption;
      else if (row?.description) content = row.description;
      else if (typeof row?.content_data === 'string') content = row.content_data;
      return {
        id: row.id,
        title: row.title,
        content,
        type: row.type,
        categories: row.categories || [],
        tags: row.tags || [],
        created_at: row.created_at
      };
    });

    res.json(results);
  } catch (err) {
    const error = err as Error;
    log.error('[Gallery] /pr-texts GET error:', error);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der PR-Texte', details: error.message });
  }
});

router.get('/pr-texts/categories', ensureAuthenticated as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const prTypes = ['instagram', 'facebook', 'twitter', 'linkedin', 'pressemitteilung', 'pr_text'];

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const data = await postgres.query(
      'SELECT DISTINCT type FROM database WHERE type = ANY($1) AND status = $2 AND is_example = $3',
      [prTypes, 'published', true],
      { table: 'database' }
    );

    const presentTypes = [...new Set((data || []).map((r: any) => r.type))];
    const labelMap: Record<string, string> = {
      instagram: 'Instagram',
      facebook: 'Facebook',
      twitter: 'Twitter',
      linkedin: 'LinkedIn',
      pressemitteilung: 'Pressemitteilung',
      pr_text: 'PR-Text'
    };
    const categories = [{ id: 'all', label: 'Alle Kategorien' }].concat(
      (presentTypes as string[]).sort().map(t => ({ id: t, label: labelMap[t] || t }))
    );

    res.json({ success: true, categories });
  } catch (err) {
    const error = err as Error;
    log.error('[Gallery] /pr-texts/categories GET error:', error);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der PR-Kategorien', details: error.message });
  }
});

export default router;
