/**
 * Template gallery routes
 * Handles public template gallery, examples, and vorlagen browsing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import express, { type Router, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../../middleware/validateBody.js';
import { getLikeCountsForEntities } from '../../../services/entityLikes/EntityLikesService.js';
import { setContentDisposition } from '../../../utils/http/contentDisposition.js';
import { createLogger } from '../../../utils/logger.js';

import type { AuthRequest } from '../types.js';

const similarBodySchema = z.object({
  query: z.string(),
  type: z.string().optional(),
  limit: z.number().optional(),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('templateGallery');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// Load system templates and files from JSON file
interface SystemTemplate {
  id: string;
  title: string;
  description: string;
  template_type: string;
  thumbnail_url: string;
  preview_image?: string;
  external_url: string;
  images: unknown[];
  categories: string[];
  tags: string[];
  content_data: unknown;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  similarity?: number;
  similarity_score?: number;
}

let systemTemplates: SystemTemplate[] = [];
let systemFiles: Array<Record<string, unknown>> = [];
const apiRoot = process.cwd();
const systemFilesDir = path.resolve(apiRoot, 'static-data/files');
const templatePreviewsDir = path.resolve(apiRoot, 'config/templates/previews');

try {
  const systemTemplatesPath = path.resolve(apiRoot, 'config/templates/system-templates.json');
  const data = fs.readFileSync(systemTemplatesPath, 'utf-8');
  const parsed = JSON.parse(data) as {
    templates?: Array<SystemTemplate & { preview_image?: string }>;
    files?: Array<Record<string, unknown>>;
  };
  systemTemplates = (parsed.templates ?? []).map((t) => ({
    ...t,
    thumbnail_url: t.preview_image ? `/auth/template-previews/${t.preview_image}` : t.thumbnail_url,
  }));
  systemFiles = parsed.files ?? [];
  log.info(
    `[Template Gallery] Loaded ${systemTemplates.length} system templates and ${systemFiles.length} system files`
  );
} catch (err) {
  log.warn('[Template Gallery] Could not load system templates:', err);
}

// Helper to get download URL for system files (mounted at /auth/system-files)
const getFileDownloadUrl = (fileName: string) =>
  `/auth/system-files/${encodeURIComponent(fileName)}`;

// Helper to get the gallery thumbnail URL for a system file.
const getFileThumbnailUrl = (fileName: string) =>
  `/auth/system-files/thumbs/${encodeURIComponent(fileName)}`;

// Seasonal system files (e.g. Pride) are only surfaced during their month.
// Evaluated per request so they appear/disappear at the month boundary with
// no manual cleanup. Pride month = June (month index 5).
const isPrideMonth = () => new Date().getMonth() === 5;

// ============================================================================
// Shared gallery builder
// ============================================================================

export interface GalleryFilters {
  searchTerm?: string;
  searchMode?: string;
  templateType?: string;
  tags?: string;
}

/**
 * Build the merged Vorlagen gallery list (published user vorlagen + system
 * templates + system files), applying the same search/type/tag filters used by
 * GET /vorlagen. Extracted so the template-interactions favorites endpoint can
 * resolve favorited ids back to full gallery objects without duplicating the
 * merge logic.
 */
export async function buildGalleryTemplates(
  filters: GalleryFilters = {}
): Promise<Array<Record<string, unknown>>> {
  const { searchTerm = '', searchMode = 'title', templateType, tags } = filters;

  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const conditions = ['is_private = $1', 'status = $2'];
  const params: unknown[] = [false, 'published'];
  let paramIndex = 3;

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
             images, categories, tags, content_data, metadata, created_at, updated_at
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
    created_at: item.created_at,
    updated_at: item.updated_at,
    // User-submitted templates: lets the gallery mark them as community
    // contributions and surface their author, distinct from official ones.
    source: 'community' as const,
  }));

  // Filter and merge system templates
  let filteredSystemTemplates = systemTemplates;
  if (templateType && templateType !== 'all') {
    filteredSystemTemplates = systemTemplates.filter((t) => t.template_type === templateType);
  }
  if (searchTerm && String(searchTerm).trim().length > 0) {
    const term = String(searchTerm).trim().toLowerCase();
    filteredSystemTemplates = filteredSystemTemplates.filter(
      (t) => t.title?.toLowerCase().includes(term) || t.description?.toLowerCase().includes(term)
    );
  }
  if (tags) {
    try {
      const tagsArray = JSON.parse(tags) as string[];
      if (Array.isArray(tagsArray) && tagsArray.length > 0) {
        filteredSystemTemplates = filteredSystemTemplates.filter((t) =>
          tagsArray.every((tag: string) => t.tags?.includes(tag.toLowerCase()))
        );
      }
    } catch {
      // Invalid tags JSON, skip filtering
    }
  }

  // Filter system files with same logic
  let filteredSystemFiles = systemFiles.map((f) => ({
    ...f,
    template_type: f.file_type as unknown,
    download_url: getFileDownloadUrl(f.file_name as string),
    thumbnail_url: getFileThumbnailUrl(f.file_name as string),
    external_url: null as null,
  })) as Array<
    Record<string, unknown> & {
      template_type: unknown;
      download_url: string;
      thumbnail_url: string;
      external_url: null;
    }
  >;

  // Hide seasonal files (e.g. Pride) outside their month.
  if (!isPrideMonth()) {
    filteredSystemFiles = filteredSystemFiles.filter((f) => f.seasonal !== 'pride');
  }

  if (templateType && templateType !== 'all') {
    filteredSystemFiles = filteredSystemFiles.filter((f) => f.file_type === templateType);
  }
  if (searchTerm && String(searchTerm).trim().length > 0) {
    const term = String(searchTerm).trim().toLowerCase();
    filteredSystemFiles = filteredSystemFiles.filter(
      (f) =>
        (f.title as string | undefined)?.toLowerCase().includes(term) ||
        (f.description as string | undefined)?.toLowerCase().includes(term)
    );
  }
  if (tags) {
    try {
      const tagsArray = JSON.parse(tags) as string[];
      if (Array.isArray(tagsArray) && tagsArray.length > 0) {
        filteredSystemFiles = filteredSystemFiles.filter((f) =>
          tagsArray.every((tag: string) =>
            (f.tags as string[] | undefined)?.includes(tag.toLowerCase())
          )
        );
      }
    } catch {
      // Invalid tags JSON, skip filtering
    }
  }

  // System templates first, then system files, then approved user vorlagen.
  // Tag the official entries so the frontend can distinguish them from
  // community contributions.
  // SystemTemplate is a known-shape interface (no index signature); the merged
  // gallery is intentionally loose, so widen at this boundary.
  return [
    ...filteredSystemTemplates.map((t) => ({ ...t, source: 'system' as const })),
    ...filteredSystemFiles.map((f) => ({ ...f, source: 'system' as const })),
    ...userVorlagen,
  ] as Array<Record<string, unknown>>;
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
      const { searchTerm, searchMode, templateType, tags } = req.query;

      const vorlagen = await buildGalleryTemplates({
        ...(searchTerm !== undefined && { searchTerm: searchTerm as string }),
        ...(searchMode !== undefined && { searchMode: searchMode as string }),
        ...(templateType !== undefined && { templateType: templateType as string }),
        ...(tags !== undefined && { tags: tags as string }),
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

// ============================================================================
// Template Preview Image Endpoint
// ============================================================================

router.get(
  '/template-previews/:fileName',
  async (req: express.Request<{ fileName: string }>, res: Response): Promise<void> => {
    try {
      const { fileName } = req.params;
      const decodedFileName = decodeURIComponent(fileName);
      const filePath = path.join(templatePreviewsDir, decodedFileName);

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(templatePreviewsDir))) {
        res.status(403).json({ success: false, message: 'Zugriff verweigert' });
        return;
      }

      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({ success: false, message: 'Vorschaubild nicht gefunden' });
        return;
      }

      const ext = path.extname(decodedFileName).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.webp': 'image/webp',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
      };
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');

      const fileStream = fs.createReadStream(resolvedPath);
      fileStream.pipe(res);
    } catch (error) {
      const err = error as Error;
      log.error('[Template Previews] Error:', err);
      res.status(500).json({ success: false, message: 'Fehler beim Laden des Vorschaubilds' });
    }
  }
);

// ============================================================================
// System File Thumbnail Endpoint
// ============================================================================

// Serve system file thumbnail (optimized for gallery display)
router.get(
  '/system-files/thumbs/:fileName',
  async (req: express.Request<{ fileName: string }>, res: Response): Promise<void> => {
    try {
      const { fileName } = req.params;
      const decodedFileName = decodeURIComponent(fileName);

      // Extract base name and construct thumbnail path
      const baseName = decodedFileName.replace(/\.[^.]+$/, '');
      const thumbName = `thumb_${baseName}.jpg`;
      const thumbPath = path.join(systemFilesDir, 'thumbs', thumbName);

      // Security: ensure file is within the thumbs directory
      const resolvedPath = path.resolve(thumbPath);
      const thumbsDir = path.resolve(systemFilesDir, 'thumbs');
      if (!resolvedPath.startsWith(thumbsDir)) {
        res.status(403).json({ success: false, message: 'Zugriff verweigert' });
        return;
      }

      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({ success: false, message: 'Thumbnail nicht gefunden' });
        return;
      }

      // Set cache headers for thumbnails (1 day)
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Type', 'image/jpeg');

      const fileStream = fs.createReadStream(resolvedPath);
      fileStream.pipe(res);
    } catch (error) {
      const err = error as Error;
      log.error('[System Files] Thumbnail error:', err);
      res.status(500).json({ success: false, message: 'Fehler beim Laden des Thumbnails' });
    }
  }
);

// ============================================================================
// System File Download Endpoint
// ============================================================================

// Download system file
router.get(
  '/system-files/:fileName',
  async (req: express.Request<{ fileName: string }>, res: Response): Promise<void> => {
    try {
      const { fileName } = req.params;
      const decodedFileName = decodeURIComponent(fileName);

      // Validate file exists in system files list
      const systemFile = systemFiles.find((f) => f.file_name === decodedFileName);
      if (!systemFile) {
        res.status(404).json({ success: false, message: 'Datei nicht gefunden' });
        return;
      }

      const filePath = path.join(systemFilesDir, decodedFileName);

      // Security: ensure file is within the files directory
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(systemFilesDir))) {
        res.status(403).json({ success: false, message: 'Zugriff verweigert' });
        return;
      }

      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({ success: false, message: 'Datei nicht gefunden' });
        return;
      }

      // Set content disposition for download
      setContentDisposition(res, decodedFileName);

      // Set content type based on file extension
      const ext = path.extname(decodedFileName).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');

      // Stream file
      const fileStream = fs.createReadStream(resolvedPath);
      fileStream.pipe(res);
    } catch (error) {
      const err = error as Error;
      log.error('[System Files] Download error:', err);
      res.status(500).json({ success: false, message: 'Fehler beim Herunterladen' });
    }
  }
);

// NOTE: Template likes & favorites live in the ts-rest
// templateInteractionsContractRouter (mounted at /api/auth/templates), which
// adds like counts, favorites, and like-notifications. The former legacy raw
// like endpoints on this router were removed in favour of that contract.

export default router;
