/**
 * Template gallery routes
 * Handles public template gallery, examples, and vorlagen browsing
 */

import express, { Router, Response } from 'express';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';
import type { AuthRequest } from '../types.js';

const log = createLogger('templateGallery');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Examples Endpoints
// ============================================================================

// Get examples (templates marked as examples)
router.get('/examples', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, limit = '20' } = req.query;

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    // Build query for examples
    let sql = `SELECT id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at, updated_at
               FROM user_templates
               WHERE is_example = $1 AND status = $2`;
    const params: any[] = [true, 'published'];

    // Filter by type if specified
    if (type) {
      sql += ` AND type = $3`;
      params.push(type);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string));

    const examples = await postgres.query(sql, params, { table: 'user_templates' });

    // Transform data to match frontend expectations
    const formattedExamples = (examples || []).map((example: any) => ({
      id: example.id,
      title: example.title,
      description: example.description,
      type: example.type || 'template',
      template_type: example.template_type || 'example',
      canva_url: example.external_url,
      preview_image_url: example.thumbnail_url,
      content_data: example.content_data,
      metadata: example.metadata,
      categories: example.categories || [],
      tags: example.tags || [],
      is_example: true,
      created_at: example.created_at,
      updated_at: example.updated_at
    }));

    res.json({
      success: true,
      data: formattedExamples,
      count: formattedExamples.length
    });

  } catch (error) {
    const err = error as Error;
    log.error('[Template Gallery /examples GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden der Beispiele.'
    });
  }
});

// Find similar examples using vector search
router.post('/examples/similar', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { query, type, limit = 5 } = req.body;

    if (!query) {
      res.status(400).json({
        success: false,
        message: 'Suchanfrage ist erforderlich.'
      });
      return;
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    // Use vectorSearchService which uses dedicated RPCs (no execute_sql dependency)
    const { DocumentSearchService } = await import('../../../services/document-services/DocumentSearchService/DocumentSearchService.js');
    const documentSearchService = new DocumentSearchService();

    let vectorResults: any[] = [];
    try {
      const search = await documentSearchService.search({
        query: String(query).trim(),
        userId: userId || 'system',
        limit: parseInt(limit),
        options: { threshold: 0.25 }
      });
      if (search.success && Array.isArray(search.results)) {
        vectorResults = search.results;
      }
    } catch (vecErr) {
      const err = vecErr as Error;
      log.warn('[Template Gallery /examples/similar POST] Vector examples search failed, falling back:', err?.message);
    }

    if (!vectorResults || vectorResults.length === 0) {
      // Fallback to text search
      let fallbackSql = `SELECT id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at, updated_at
                         FROM user_templates
                         WHERE is_example = $1 AND status = $2 AND title ILIKE $3`;
      const fallbackParams: any[] = [true, 'published', `%${String(query).trim()}%`];

      if (type) {
        fallbackSql += ` AND type = $4`;
        fallbackParams.push(type);
      }

      fallbackSql += ` LIMIT $${fallbackParams.length + 1}`;
      fallbackParams.push(parseInt(limit));

      const fallbackResults = await postgres.query(fallbackSql, fallbackParams, { table: 'user_templates' });

      res.json({
        success: true,
        data: fallbackResults || [],
        search_method: 'text_search',
        message: 'Verwendet Textsuche als Fallback'
      });
      return;
    }

    // Fetch full database rows to ensure consistent shape for frontend
    const ids = vectorResults.map((r: any) => r.id).filter(Boolean);
    let fullRows: any[] = [];
    if (ids.length > 0) {
      const rows = await postgres.query(
        `SELECT id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at, updated_at
         FROM user_templates
         WHERE is_example = $1 AND status = $2 AND id = ANY($3)`,
        [true, 'published', ids],
        { table: 'user_templates' }
      );

      if (Array.isArray(rows)) {
        // Keep the vector order
        const rowMap = new Map(rows.map((r: any) => [r.id, r]));
        fullRows = ids.map((id: string) => rowMap.get(id)).filter(Boolean);
      }
    }

    const formattedResults = (fullRows.length > 0 ? fullRows : vectorResults).map((example: any) => ({
      id: example.id,
      title: example.title,
      description: example.description,
      type: example.type,
      template_type: example.template_type || 'example',
      canva_url: example.external_url,
      preview_image_url: example.thumbnail_url,
      content_data: example.content_data,
      metadata: example.metadata,
      categories: example.categories || [],
      tags: example.tags || [],
      similarity: example.similarity || example.similarity_score || null,
      is_example: true,
      created_at: example.created_at,
      updated_at: example.updated_at
    }));

    res.json({
      success: true,
      data: formattedResults,
      query: String(query).trim(),
      search_method: 'vector_search',
      count: formattedResults.length
    });

  } catch (error) {
    const err = error as Error;
    log.error('[Template Gallery /examples/similar POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler bei der Ähnlichkeitssuche.'
    });
  }
});

// ============================================================================
// Vorlagen Gallery Endpoints
// ============================================================================

// Get dynamic template type categories for Vorlagen gallery
router.get('/vorlagen-categories', ensureAuthenticated as any, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const data = await postgres.query(
      `SELECT DISTINCT template_type
       FROM user_templates
       WHERE is_private = $1 AND status = $2 AND template_type IS NOT NULL
       ORDER BY template_type ASC`,
      [false, 'published'],
      { table: 'user_templates' }
    );

    const categories = (data || [])
      .map((row: any) => row.template_type)
      .filter(Boolean)
      .map((type: string) => ({
        id: type,
        label: type.charAt(0).toUpperCase() + type.slice(1)
      }));

    res.json({ success: true, categories });
  } catch (error) {
    const err = error as Error;
    log.error('[Vorlagen Gallery] /vorlagen-categories error:', err);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Kategorien',
      categories: []
    });
  }
});

// List all published templates for Vorlagen gallery
router.get('/vorlagen', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  log.debug('>>> /vorlagen endpoint HIT <<<');
  try {
    const { searchTerm = '', searchMode = 'title', templateType, tags } = req.query;

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const conditions = ['is_private = $1', 'status = $2'];
    const params: any[] = [false, 'published'];
    let paramIndex = 3;

    if (templateType && templateType !== 'all') {
      conditions.push(`template_type = $${paramIndex++}`);
      params.push(templateType);
    }

    // Filter by tags using JSONB containment
    if (tags) {
      try {
        const tagsArray = JSON.parse(tags as string);
        if (Array.isArray(tagsArray) && tagsArray.length > 0) {
          conditions.push(`tags @> $${paramIndex++}::jsonb`);
          params.push(JSON.stringify(tagsArray));
        }
      } catch {
        log.warn('[Vorlagen Gallery] Invalid tags JSON:', tags);
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
      SELECT id, title, description, template_type, thumbnail_url, external_url,
             images, categories, tags, content_data, metadata, created_at, updated_at
      FROM user_templates
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const data = await postgres.query(query, params, { table: 'user_templates' });

    const vorlagen = (data || []).map((item: any) => {
      log.debug(`[Vorlagen DEBUG] Item: id=${item.id}, title=${item.title}, external_url=${item.external_url}`);
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        template_type: item.template_type,
        thumbnail_url: item.thumbnail_url,
        external_url: item.external_url,
        images: item.images || [],
        categories: item.categories || [],
        tags: item.tags || [],
        content_data: item.content_data || {},
        metadata: item.metadata || {},
        created_at: item.created_at,
        updated_at: item.updated_at
      };
    });

    res.json({ success: true, vorlagen });
  } catch (error) {
    const err = error as Error;
    log.error('[Vorlagen Gallery] /vorlagen GET error:', err);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Vorlagen',
      vorlagen: []
    });
  }
});

export default router;
