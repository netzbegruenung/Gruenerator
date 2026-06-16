/**
 * Template gallery routes
 * Handles public template gallery, examples, and vorlagen browsing
 */

import express, { type Router, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../../middleware/validateBody.js';
import { getLikeCountsForEntities } from '../../../services/entityLikes/EntityLikesService.js';
import { createLogger } from '../../../utils/logger.js';

import type { AuthRequest } from '../types.js';

const similarBodySchema = z.object({
  query: z.string(),
  type: z.string().optional(),
  limit: z.number().optional(),
});

const log = createLogger('templateGallery');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Shared gallery builder
// ============================================================================

export interface GalleryFilters {
  searchTerm?: string;
  searchMode?: string;
  templateType?: string;
  tags?: string;
  /**
   * When set, restrict the gallery to templates targeted at this locale plus
   * the locale-agnostic 'all'. Omit to return templates for every audience
   * (used by the favorites lookup, and when the user turns the locale filter off).
   */
  audience?: 'de-DE' | 'de-AT';
}

/**
 * Build the published Vorlagen gallery list from user-submitted templates,
 * applying the search/type/tag/audience filters used by GET /vorlagen.
 * Extracted so the template-interactions favorites endpoint can resolve
 * favorited ids back to full gallery objects without duplicating the query.
 */
export async function buildGalleryTemplates(
  filters: GalleryFilters = {}
): Promise<Array<Record<string, unknown>>> {
  const { searchTerm = '', searchMode = 'title', templateType, tags, audience } = filters;

  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const conditions = ['is_private = $1', 'status = $2'];
  const params: unknown[] = [false, 'published'];
  let paramIndex = 3;

  if (audience) {
    // Include locale-agnostic ('all') templates alongside the viewer's locale.
    conditions.push(`audience IN ($${paramIndex}, 'all')`);
    params.push(audience);
    paramIndex++;
  }

  if (templateType && templateType !== 'all') {
    conditions.push(`template_type = $${paramIndex++}`);
    params.push(templateType);
  }

  if (tags) {
    try {
      const tagsArray = JSON.parse(tags) as unknown[];
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
             images, categories, tags, content_data, metadata, audience, created_at, updated_at
      FROM user_templates
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 100
    `;

  const data = await postgres.query(query, params, { table: 'user_templates' });

  const userVorlagen = (
    (data || []) as Array<{
      id: string;
      title: string;
      description: string;
      template_type: string;
      thumbnail_url: string;
      external_url: string;
      images: unknown[];
      categories: string[];
      tags: string[];
      content_data: unknown;
      metadata: unknown;
      audience: string;
      created_at: string;
      updated_at: string;
    }>
  ).map((item) => ({
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
    audience: item.audience || 'all',
    created_at: item.created_at,
    updated_at: item.updated_at,
  }));

  return userVorlagen as Array<Record<string, unknown>>;
}

/**
 * Attach a `likes_count` to each gallery item via a single batched query,
 * avoiding N+1 lookups. Mutates and returns the same array.
 */
export async function attachLikeCounts(
  templates: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const ids = templates.map((t) => String(t.id)).filter(Boolean);
  const counts = await getLikeCountsForEntities('template', ids);
  for (const t of templates) {
    t.likes_count = counts.get(String(t.id)) ?? 0;
  }
  return templates;
}

// ============================================================================
// Examples Endpoints
// ============================================================================

// Get examples (templates marked as examples)
router.get(
  '/examples',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { type, limit = '20' } = req.query;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Build query for examples
      let sql = `SELECT id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at, updated_at
               FROM user_templates
               WHERE is_example = $1 AND status = $2`;
      const params: unknown[] = [true, 'published'];

      // Filter by type if specified
      if (type) {
        sql += ` AND type = $3`;
        params.push(type as string);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit as string));

      const examples = await postgres.query(sql, params, { table: 'user_templates' });

      // Transform data to match frontend expectations
      const formattedExamples = (
        (examples || []) as Array<{
          id: string;
          title: string;
          description: string;
          type: string;
          template_type: string;
          external_url: string;
          thumbnail_url: string;
          content_data: unknown;
          metadata: unknown;
          categories: string[];
          tags: string[];
          created_at: string;
          updated_at: string;
        }>
      ).map((example) => ({
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
        updated_at: example.updated_at,
      }));

      res.json({
        success: true,
        data: formattedExamples,
        count: formattedExamples.length,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[Template Gallery /examples GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Beispiele.',
      });
    }
  }
);

// Find similar examples using vector search
router.post(
  '/examples/similar',
  ensureAuthenticated,
  validateBody(similarBodySchema),
  async (
    req: TypedRequest<{ query: string; type?: string; limit?: number }>,
    res: Response
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { query, type, limit = 5 } = req.body;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Use vectorSearchService which uses dedicated RPCs (no execute_sql dependency)
      const { DocumentSearchService } =
        await import('../../../services/document-services/DocumentSearchService/DocumentSearchService.js');
      const documentSearchService = new DocumentSearchService();

      let vectorResults: Array<Record<string, unknown>> = [];
      try {
        const search = await documentSearchService.search({
          query: String(query).trim(),
          userId: userId || 'system',
          limit: typeof limit === 'number' ? limit : parseInt(String(limit)),
          options: { threshold: 0.25 },
        });
        if (search.success && Array.isArray(search.results)) {
          vectorResults = (search.results as unknown as Array<Record<string, unknown>>) || [];
        }
      } catch (vecErr) {
        const err = vecErr as Error;
        log.warn(
          '[Template Gallery /examples/similar POST] Vector examples search failed, falling back:',
          err?.message
        );
      }

      if (!vectorResults || vectorResults.length === 0) {
        // Fallback to text search
        let fallbackSql = `SELECT id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at, updated_at
                         FROM user_templates
                         WHERE is_example = $1 AND status = $2 AND title ILIKE $3`;
        const fallbackParams: unknown[] = [true, 'published', `%${String(query).trim()}%`];

        if (type) {
          fallbackSql += ` AND type = $4`;
          fallbackParams.push(type);
        }

        fallbackSql += ` LIMIT $${fallbackParams.length + 1}`;
        fallbackParams.push(typeof limit === 'number' ? limit : parseInt(String(limit)));

        const fallbackResults = await postgres.query(fallbackSql, fallbackParams, {
          table: 'user_templates',
        });

        res.json({
          success: true,
          data: fallbackResults || [],
          search_method: 'text_search',
          message: 'Verwendet Textsuche als Fallback',
        });
        return;
      }

      // Fetch full database rows to ensure consistent shape for frontend
      const ids = vectorResults.map((r) => r.id).filter(Boolean);
      let fullRows: Array<Record<string, unknown>> = [];
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
          const rowMap = new Map(
            (rows as Array<Record<string, unknown>>).map((r) => [r.id as string, r])
          );
          fullRows = ids
            .map((id) => rowMap.get(id as string))
            .filter((r): r is Record<string, unknown> => r != null);
        }
      }

      const formattedResults = (fullRows.length > 0 ? fullRows : vectorResults).map(
        (example: Record<string, unknown>) => ({
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
          updated_at: example.updated_at,
        })
      );

      res.json({
        success: true,
        data: formattedResults,
        query: String(query).trim(),
        search_method: 'vector_search',
        count: formattedResults.length,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[Template Gallery /examples/similar POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler bei der Ähnlichkeitssuche.',
      });
    }
  }
);

// ============================================================================
// Vorlagen Gallery Endpoints
// ============================================================================

// Get dynamic template type categories for Vorlagen gallery
router.get(
  '/vorlagen-categories',
  ensureAuthenticated,
  async (_req: AuthRequest, res: Response): Promise<void> => {
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
        .map((row: Record<string, unknown>) => row.template_type as string)
        .filter(Boolean)
        .map((type: string) => ({
          id: type,
          label: type.charAt(0).toUpperCase() + type.slice(1),
        }));

      res.json({ success: true, categories });
    } catch (error) {
      const err = error as Error;
      log.error('[Vorlagen Gallery] /vorlagen-categories error:', err);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Kategorien',
        categories: [],
      });
    }
  }
);

// List all published templates for Vorlagen gallery
router.get(
  '/vorlagen',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    log.debug('>>> /vorlagen endpoint HIT <<<');
    try {
      const { searchTerm, searchMode, templateType, tags, localeFilter } = req.query;

      // Scope the gallery to the viewer's locale by default; the client can turn
      // this off via ?localeFilter=false to browse templates from all audiences.
      const applyLocaleFilter = localeFilter !== 'false';
      const viewerLocale = req.user?.locale;

      const vorlagen = await buildGalleryTemplates({
        ...(searchTerm !== undefined && { searchTerm: searchTerm as string }),
        ...(searchMode !== undefined && { searchMode: searchMode as string }),
        ...(templateType !== undefined && { templateType: templateType as string }),
        ...(tags !== undefined && { tags: tags as string }),
        ...(applyLocaleFilter && viewerLocale ? { audience: viewerLocale } : {}),
      });

      await attachLikeCounts(vorlagen);

      res.json({ success: true, vorlagen });
    } catch (error) {
      const err = error as Error;
      log.error('[Vorlagen Gallery] /vorlagen GET error:', err);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Vorlagen',
        vorlagen: [],
      });
    }
  }
);

// NOTE: The Vorlagen gallery serves only user-submitted templates. The former
// system-template / system-file content (and its /template-previews and
// /system-files file-serving endpoints) was removed.

// NOTE: Template likes & favorites live in the ts-rest
// templateInteractionsContractRouter (mounted at /api/auth/templates), which
// adds like counts, favorites, and like-notifications. The former legacy raw
// like endpoints on this router were removed in favour of that contract.

export default router;
