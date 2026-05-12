/**
 * User gallery and database listing routes
 * Handles unified gallery, categories, and content type listings
 */

import express, { type Router, type Response } from 'express';

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

router.get(
  '/database',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        searchTerm = '',
        searchMode: _searchMode = 'title',
        category,
        types,
        onlyExamples = 'true',
        status = 'published',
        limit = '200',
      } = req.query;

      const typeList = types
        ? String(types)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      if (searchTerm && String(searchTerm).trim().length > 0) {
        const raw = String(searchTerm).trim();
        const escapedRegex = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patternExact = `\\m${escapedRegex}\\M`;
        const patternPrefix = `\\m${escapedRegex}`;
        const likeTerm = `%${raw}%`;

        const params: unknown[] = [];
        let paramIndex = 1;
        const conditions: string[] = [];

        if (status) {
          conditions.push(`status = $${paramIndex++}`);
          params.push(String(status));
        }
        if (onlyExamples === 'true') {
          conditions.push(`is_example = true`);
        }
        if (typeList.length > 0) {
          conditions.push(`type = ANY($${paramIndex++})`);
          params.push(typeList);
        }
        if (category && category !== 'all') {
          conditions.push(`categories @> $${paramIndex++}::jsonb`);
          params.push(JSON.stringify([String(category)]));
        }

        const likeIdx = paramIndex++;
        params.push(likeTerm);
        const searchOrSql = `(
          title ILIKE $${likeIdx} OR
          description ILIKE $${likeIdx} OR
          content_data->>'content' ILIKE $${likeIdx} OR
          content_data->>'caption' ILIKE $${likeIdx} OR
          content_data->>'text' ILIKE $${likeIdx}
        )`;
        conditions.push(searchOrSql);

        const exactIdx = paramIndex++;
        params.push(patternExact);
        const prefixIdx = paramIndex++;
        params.push(patternPrefix);

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limitIdx = paramIndex++;
        params.push(Math.min(Math.max(parseInt(String(limit), 10) || 200, 1), 500));

        const sql = `
        SELECT
          id, type, title, description, content_data, categories, tags, created_at, status, is_example, is_private,
          CASE
            WHEN (title ~* $${exactIdx} OR description ~* $${exactIdx} OR content_data->>'content' ~* $${exactIdx} OR content_data->>'caption' ~* $${exactIdx} OR content_data->>'text' ~* $${exactIdx}) THEN 0
            WHEN (title ~* $${prefixIdx} OR description ~* $${prefixIdx} OR content_data->>'content' ~* $${prefixIdx} OR content_data->>'caption' ~* $${prefixIdx} OR content_data->>'text' ~* $${prefixIdx}) THEN 1
            WHEN ${searchOrSql} THEN 2
            ELSE 3
          END AS rank_bucket
        FROM database
        ${where}
        ORDER BY rank_bucket ASC, created_at DESC
        LIMIT $${limitIdx}
      `;

        try {
          const postgres = getPostgresInstance();
          await postgres.ensureInitialized();
          const rankedData = await postgres.query(sql, params);
          res.json({ success: true, data: rankedData || [] });
          return;
        } catch (sqlError) {
          log.warn(
            '[Gallery] Direct SQL query failed, falling back to simpler query:',
            (sqlError as Error)?.message
          );
        }
      }

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const conditions: string[] = [];
      const params: unknown[] = [];
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

        const scoreItem = (row: Record<string, unknown>) => {
          const contentData = (row?.content_data || {}) as Record<string, unknown>;
          const textParts = [
            (row?.title as string) || '',
            (row?.description as string) || '',
            (contentData.content as string) || '',
            (contentData.caption as string) || '',
            (contentData.text as string) || '',
          ];
          const combined = textParts.join(' ');
          if (wordRe.test(combined)) return 0;
          if (prefixRe.test(combined)) return 1;
          if (substringRe.test(combined)) return 2;
          return 3;
        };

        responseData = responseData
          .map((r) => ({ r, s: scoreItem(r) }))
          .sort((a, b) => {
            if (a.s !== b.s) return a.s - b.s;
            const at = new Date(a.r.created_at as string).getTime();
            const bt = new Date(b.r.created_at as string).getTime();
            return bt - at;
          })
          .map((x) => x.r);
      }

      res.json({ success: true, data: responseData });
    } catch (err) {
      const error = err as Error;
      log.error('[Gallery] /database GET error:', { error });
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Datenbank-Inhalte',
        details: error.message,
        data: [],
      });
    }
  }
);

// ============================================================================
// Anträge Gallery
// ============================================================================

router.get(
  '/antraege-categories',
  ensureAuthenticated,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const data = await postgres.query(
        'SELECT categories FROM database WHERE type = $1 AND status = $2 AND is_private = $3',
        ['antrag', 'published', false],
        { table: 'database' }
      );

      const allCategories = (data || [])
        .flatMap((row: Record<string, unknown>) =>
          Array.isArray(row.categories) ? (row.categories as string[]) : []
        )
        .filter(Boolean);

      const unique = [...new Set(allCategories)].sort();
      const categories = unique.map((c) => ({ id: c, label: c }));

      res.json({ success: true, categories });
    } catch (err) {
      const error = err as Error;
      log.error('[Gallery] /antraege-categories error:', { error });
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Kategorien',
        details: error.message,
      });
    }
  }
);

router.get(
  '/antraege',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { searchTerm = '', searchMode = 'title', categoryId } = req.query;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const conditions = ['type = $1', 'status = $2', 'is_private = $3'];
      const params: Array<string | number | boolean> = ['antrag', 'published', false];
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
      log.error('[Gallery] /antraege GET error:', { error });
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Anträge',
        details: error.message,
        antraege: [],
      });
    }
  }
);

// ============================================================================
// Custom Generators Gallery
// ============================================================================

router.get(
  '/custom-generators',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { searchTerm = '', category } = req.query;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const conditions = ['is_active = true'];
      const params: unknown[] = [];
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

      const generators = (data || []).map((g: Record<string, unknown>) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        description: g.description,
        created_at: g.created_at,
      }));

      res.json({ success: true, generators });
    } catch (err) {
      const error = err as Error;
      log.error('[Gallery] /custom-generators GET error:', { error });
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Grüneratoren',
        details: error.message,
        generators: [],
      });
    }
  }
);

// ============================================================================
// PR Texts Gallery
// ============================================================================

router.get(
  '/pr-texts',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { searchTerm = '', searchMode = 'title', categoryId } = req.query;

      const prTypes = [
        'instagram',
        'facebook',
        'twitter',
        'linkedin',
        'pressemitteilung',
        'pr_text',
      ];

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const conditions = ['type = ANY($1)', 'status = $2', 'is_example = $3'];
      const params: unknown[] = [prTypes, 'published', true];
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

      const results = (data || []).map((row: Record<string, unknown>) => {
        const contentData = (row?.content_data || {}) as Record<string, unknown>;
        let content = '';
        if (contentData.content) content = contentData.content as string;
        else if (contentData.caption) content = contentData.caption as string;
        else if (row?.description) content = row.description as string;
        else if (typeof row?.content_data === 'string') content = row.content_data;
        return {
          id: row.id,
          title: row.title,
          content,
          type: row.type,
          categories: row.categories || [],
          tags: row.tags || [],
          created_at: row.created_at,
        };
      });

      res.json(results);
    } catch (err) {
      const error = err as Error;
      log.error('[Gallery] /pr-texts GET error:', { error });
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der PR-Texte',
        details: error.message,
      });
    }
  }
);

router.get(
  '/pr-texts/categories',
  ensureAuthenticated,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const prTypes = [
        'instagram',
        'facebook',
        'twitter',
        'linkedin',
        'pressemitteilung',
        'pr_text',
      ];

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const data = await postgres.query(
        'SELECT DISTINCT type FROM database WHERE type = ANY($1) AND status = $2 AND is_example = $3',
        [prTypes, 'published', true],
        { table: 'database' }
      );

      const presentTypes = [
        ...new Set((data || []).map((r: Record<string, unknown>) => r.type as string)),
      ];
      const labelMap: Record<string, string> = {
        instagram: 'Instagram',
        facebook: 'Facebook',
        twitter: 'Twitter',
        linkedin: 'LinkedIn',
        pressemitteilung: 'Pressemitteilung',
        pr_text: 'PR-Text',
      };
      const categories = [{ id: 'all', label: 'Alle Kategorien' }].concat(
        (presentTypes as string[]).sort().map((t) => ({ id: t, label: labelMap[t] || t }))
      );

      res.json({ success: true, categories });
    } catch (err) {
      const error = err as Error;
      log.error('[Gallery] /pr-texts/categories GET error:', { error });
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der PR-Kategorien',
        details: error.message,
      });
    }
  }
);

export default router;
