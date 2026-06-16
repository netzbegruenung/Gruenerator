/**
 * ts-rest contract router for user template (Vorlagen) CRUD endpoints.
 *
 * Replaces the legacy Express router in userTemplates.ts. Covers 8 routes:
 *   - POST   /api/auth/user-templates/from-url        (preview / save)
 *   - GET    /api/auth/user-templates
 *   - POST   /api/auth/user-templates
 *   - DELETE /api/auth/user-templates/bulk
 *   - PUT    /api/auth/user-templates/:id
 *   - DELETE /api/auth/user-templates/:id
 *   - POST   /api/auth/user-templates/:id/metadata
 *   - POST   /api/auth/user-templates/:id/instantiate
 *
 * requireAuth is applied at the /api/auth/user-templates prefix in routes.ts.
 */

import { userTemplatesContract, type UserTemplate } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import {
  urlCrawlerService,
  UrlValidator,
} from '../../../services/scrapers/implementations/UrlCrawler/index.js';
import { createDocFromTemplate } from '../../../services/templates/collaborativeTemplateService.js';
import {
  enrichTemplate,
  deleteTemplateVector,
} from '../../../services/templates/templateEnrichment.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../../utils/getAuthedUser.js';
import { createLogger } from '../../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('userTemplatesContractRouter');

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTagsFromDescription(description: string | undefined | null): string[] {
  if (!description || typeof description !== 'string') return [];
  const tagPattern = /#([\w-]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagPattern.exec(description)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

const TEMPLATE_STATUSES = ['draft', 'pending_review', 'published', 'rejected'] as const;

function toStatus(value: unknown): UserTemplate['status'] {
  return (TEMPLATE_STATUSES as readonly string[]).includes(value as string)
    ? (value as UserTemplate['status'])
    : 'published';
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : new Date(String(value)).toISOString();
}

function strOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

/**
 * Map a raw `user_templates` row (Record<string, unknown> from PostgresService)
 * to the formatted response shape. The casts here sit at the DB→type boundary —
 * the row is genuinely untyped JSON until this point. Note the
 * thumbnail_url → preview_image_url rename the frontend expects.
 */
function formatTemplate(row: Record<string, unknown>): UserTemplate {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    description: strOrNull(row.description),
    type: String(row.type ?? 'template'),
    template_type: String(row.template_type ?? 'template'),
    external_url: strOrNull(row.external_url),
    preview_image_url: strOrNull(row.thumbnail_url),
    images: Array.isArray(row.images) ? row.images : [],
    categories: Array.isArray(row.categories) ? row.categories : [],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    content_data: row.content_data ?? {},
    metadata: row.metadata ?? {},
    is_private: Boolean(row.is_private),
    status: toStatus(row.status),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

const TABLE = { table: 'user_templates' } as const;

// ── Router ─────────────────────────────────────────────────────────────────────

const s = initServer();

export const userTemplatesContractRouter = s.router(userTemplatesContract, {
  fromUrl: async (args) => {
    try {
      getAuthedUser(args.req);
      const { url, preview, title, description, metadata } = args.body;

      // The user explicitly pasted this single template link — skip robots.txt
      // (that's for bulk crawling; Canva disallows /design/ outright). Format
      // and SSRF/private-network checks still run.
      const validation = await UrlValidator.validateUrl(url, { checkRobots: false });
      if (!validation.isValid) {
        return {
          status: 400 as const,
          body: { success: false, message: validation.error || 'Ungültige URL.' },
        };
      }

      // Metadata crawl is best-effort enrichment only. Many template hosts
      // (Canva /design/ links especially) block crawling or require a browser,
      // so a failure here must NOT prevent previewing or saving the link.
      const crawlResult = await urlCrawlerService
        .crawlUrl(url, {
          enhancedMetadata: true,
          metadataOnly: true,
          timeout: 15000,
        })
        .catch(() => null);

      const crawled = crawlResult?.success && crawlResult.data ? crawlResult.data : null;

      if (preview) {
        return {
          status: 200 as const,
          body: {
            success: true,
            preview: {
              title: crawled?.title || null,
              description: crawled?.description || null,
              thumbnail_url: crawled?.previewImage || null,
              dimensions: crawled?.dimensions || null,
              categories: crawled?.categories || [],
              final_url: crawled?.canonical || url,
            },
          },
        };
      }

      const user = getAuthedUser(args.req);
      const userId = user.id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const mergedTags = [...new Set(extractTagsFromDescription(description))];

      const templateData = {
        user_id: userId,
        type: 'template',
        title: (title || crawled?.title || 'Vorlage').trim(),
        description: (description || crawled?.description || '').trim() || null,
        template_type: 'canva',
        external_url: crawled?.canonical || url,
        thumbnail_url: crawled?.previewImage || null,
        images: JSON.stringify(crawled?.previewImage ? [{ url: crawled.previewImage }] : []),
        categories: JSON.stringify([]),
        tags: JSON.stringify(mergedTags),
        content_data: JSON.stringify({}),
        metadata: JSON.stringify({
          ...(metadata || {}),
          crawled_from: url,
          dimensions: crawled?.dimensions || null,
        }),
        is_private: false,
        is_example: false,
        status: 'pending_review',
        // Target the creator's locale so the gallery can scope by audience.
        audience: user.locale ?? 'all',
      };

      const newTemplate = await postgres.insert('user_templates', templateData);

      // Fire-and-forget: vision description (if empty) + vector indexing.
      void enrichTemplate(String(newTemplate.id)).catch((e) =>
        log.warn('[userTemplatesContract.fromUrl] enrichTemplate failed', e)
      );

      return {
        status: 201 as const,
        body: {
          success: true,
          data: { id: String(newTemplate.id) },
          message: 'Vorlage wurde eingereicht und wird geprüft.',
        },
      };
    } catch (error) {
      log.error('[userTemplatesContract.fromUrl] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Verarbeiten der URL.' },
      };
    }
  },

  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const templateTypeFilter = args.query.template_type ?? null;

      const rows = templateTypeFilter
        ? await postgres.query(
            `SELECT * FROM user_templates
             WHERE user_id = $1 AND type = $2 AND is_example = $3 AND template_type = $4
             ORDER BY updated_at DESC`,
            [userId, 'template', false, templateTypeFilter],
            TABLE
          )
        : await postgres.query(
            `SELECT * FROM user_templates
             WHERE user_id = $1 AND type = $2 AND is_example = $3
             ORDER BY updated_at DESC`,
            [userId, 'template', false],
            TABLE
          );

      return {
        status: 200 as const,
        body: { success: true, data: rows.map(formatTemplate) },
      };
    } catch (error) {
      log.error('[userTemplatesContract.list] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Laden der Vorlagen.' },
      };
    }
  },

  create: async (args) => {
    try {
      const user = getAuthedUser(args.req);
      const userId = user.id;
      const {
        title,
        description,
        template_type = 'template',
        external_url: externalUrl,
        preview_image_url,
        images = [],
        categories = [],
        tags = [],
        content_data = {},
        metadata = {},
        is_private = false,
      } = args.body;

      if (!title) {
        return {
          status: 400 as const,
          body: { success: false, message: 'Titel ist erforderlich.' },
        };
      }

      const descriptionTags = extractTagsFromDescription(description).map((t) => t.toLowerCase());
      const providedTags = Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase()) : [];
      const mergedTags = [...new Set([...descriptionTags, ...providedTags])];

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const isPrivate = is_private !== false;

      const templateData = {
        user_id: userId,
        type: 'template',
        title: String(title).trim(),
        description: description ? String(description).trim() : null,
        template_type,
        external_url: externalUrl || null,
        thumbnail_url: preview_image_url || null,
        images: JSON.stringify(Array.isArray(images) ? images : []),
        categories: JSON.stringify(Array.isArray(categories) ? categories : []),
        tags: JSON.stringify(mergedTags),
        content_data: JSON.stringify(content_data || {}),
        metadata: JSON.stringify(metadata || {}),
        is_private: isPrivate,
        is_example: false,
        status: isPrivate ? 'draft' : 'pending_review',
        // Target the creator's locale so the gallery can scope by audience.
        audience: user.locale ?? 'all',
      };

      const newTemplate = await postgres.insert('user_templates', templateData);

      // Fire-and-forget: vision description (if empty) + vector indexing.
      void enrichTemplate(String(newTemplate.id)).catch((e) =>
        log.warn('[userTemplatesContract.create] enrichTemplate failed', e)
      );

      return {
        status: 201 as const,
        body: {
          success: true,
          data: formatTemplate(newTemplate),
          message: isPrivate
            ? 'Vorlage wurde erstellt.'
            : 'Vorlage wurde eingereicht und wird geprüft.',
        },
      };
    } catch (error) {
      log.error('[userTemplatesContract.create] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Erstellen der Vorlage.' },
      };
    }
  },

  bulkDelete: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { ids } = args.body;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const verifyTemplates = await postgres.query<{ id: string }>(
        `SELECT id FROM user_templates
         WHERE user_id = $1 AND type = $2 AND id = ANY($3)`,
        [userId, 'template', ids],
        TABLE
      );

      const ownedIds = verifyTemplates.map((t) => t.id);
      const unauthorizedIds = ids.filter((id) => !ownedIds.includes(id));

      if (unauthorizedIds.length > 0) {
        return {
          status: 403 as const,
          body: {
            success: false,
            message: `Access denied for templates: ${unauthorizedIds.join(', ')}`,
            unauthorized_ids: unauthorizedIds,
          },
        };
      }

      const deletedData = await postgres.query<{ id: string }>(
        `DELETE FROM user_templates
         WHERE user_id = $1 AND type = $2 AND id = ANY($3)
         RETURNING id`,
        [userId, 'template', ids],
        TABLE
      );

      const deletedIds = deletedData.map((t) => t.id);
      const failedIds = ids.filter((id) => !deletedIds.includes(id));

      for (const deletedId of deletedIds) void deleteTemplateVector(deletedId);

      return {
        status: 200 as const,
        body: {
          success: true,
          message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} templates deleted successfully`,
          deleted_count: deletedIds.length,
          failed_ids: failedIds,
          total_requested: ids.length,
          deleted_ids: deletedIds,
        },
      };
    } catch (error) {
      log.error('[userTemplatesContract.bulkDelete] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Failed to perform bulk delete of templates' },
      };
    }
  },

  update: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { id } = args.params;
      const {
        title,
        description,
        template_type,
        external_url: externalUrl,
        preview_image_url,
        images,
        categories,
        tags,
        content_data,
        metadata,
        is_private,
      } = args.body;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const existingTemplate = await postgres.queryOne(
        `SELECT user_id, metadata FROM user_templates WHERE id = $1 AND type = $2`,
        [id, 'template'],
        TABLE
      );

      if (!existingTemplate) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Vorlage nicht gefunden.' },
        };
      }

      if (existingTemplate.user_id !== userId) {
        return {
          status: 403 as const,
          body: { success: false, message: 'Keine Berechtigung, diese Vorlage zu bearbeiten.' },
        };
      }

      const updateData: Record<string, unknown> = {};

      if (title !== undefined) updateData.title = String(title).trim();
      if (description !== undefined)
        updateData.description = description ? String(description).trim() : null;
      if (template_type !== undefined) updateData.template_type = template_type;
      if (externalUrl !== undefined) updateData.external_url = externalUrl;
      if (preview_image_url !== undefined) updateData.thumbnail_url = preview_image_url;
      if (images !== undefined) updateData.images = Array.isArray(images) ? images : [];
      if (categories !== undefined)
        updateData.categories = Array.isArray(categories) ? categories : [];
      if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
      if (content_data !== undefined) updateData.content_data = content_data;
      if (is_private !== undefined) updateData.is_private = is_private;

      if (metadata !== undefined) {
        const existingMetadata = (existingTemplate.metadata || {}) as Record<string, unknown>;
        updateData.metadata = { ...existingMetadata, ...(metadata || {}) };
      }

      const result = await postgres.update('user_templates', updateData, { id, user_id: userId });

      if (result.changes === 0) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Vorlage nicht gefunden oder nicht aktualisiert.' },
        };
      }

      // Re-index when searchable fields changed (re-embeds; re-runs vision only
      // if the description was cleared).
      if (
        'title' in updateData ||
        'description' in updateData ||
        'tags' in updateData ||
        'is_private' in updateData
      ) {
        void enrichTemplate(id).catch((e) =>
          log.warn('[userTemplatesContract.update] enrichTemplate failed', e)
        );
      }

      return {
        status: 200 as const,
        body: {
          success: true,
          data: formatTemplate(result.data[0]),
          message: 'Vorlage wurde erfolgreich aktualisiert.',
        },
      };
    } catch (error) {
      log.error('[userTemplatesContract.update] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Aktualisieren der Vorlage.' },
      };
    }
  },

  remove: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { id } = args.params;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const result = await postgres.delete('user_templates', {
        id,
        user_id: userId,
        type: 'template',
      });

      if (result.changes === 0) {
        return {
          status: 404 as const,
          body: {
            success: false,
            message: 'Vorlage nicht gefunden oder keine Berechtigung zum Löschen.',
          },
        };
      }

      void deleteTemplateVector(id);

      return {
        status: 200 as const,
        body: { success: true, message: 'Vorlage wurde erfolgreich gelöscht.' },
      };
    } catch (error) {
      log.error('[userTemplatesContract.remove] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Löschen der Vorlage.' },
      };
    }
  },

  updateMetadata: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { id } = args.params;
      const { title, description, template_type, is_private } = args.body;

      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const existingTemplate = await postgres.queryOne(
        `SELECT user_id, metadata FROM user_templates WHERE id = $1 AND type = $2`,
        [id, 'template'],
        TABLE
      );

      if (!existingTemplate) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Vorlage nicht gefunden.' },
        };
      }

      if (existingTemplate.user_id !== userId) {
        return {
          status: 403 as const,
          body: { success: false, message: 'Keine Berechtigung, diese Vorlage zu bearbeiten.' },
        };
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (title !== undefined) updateData.title = String(title).trim();
      if (description !== undefined)
        updateData.description = description ? String(description).trim() : null;
      if (is_private !== undefined) updateData.is_private = is_private;
      if (template_type !== undefined) updateData.template_type = template_type;

      const result = await postgres.update('user_templates', updateData, { id, user_id: userId });

      if (result.changes === 0) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Vorlage nicht gefunden oder nicht aktualisiert.' },
        };
      }

      return {
        status: 200 as const,
        body: { success: true, message: 'Vorlagen-Metadaten wurden erfolgreich aktualisiert.' },
      };
    } catch (error) {
      log.error('[userTemplatesContract.updateMetadata] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Aktualisieren der Vorlagen-Metadaten.' },
      };
    }
  },

  instantiate: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { id } = args.params;
      const { title } = args.body;

      const result = await createDocFromTemplate(userId, id, title);

      return {
        status: 201 as const,
        body: {
          success: true,
          data: { documentId: result.documentId, subtype: result.subtype },
        },
      };
    } catch (error) {
      const message = (error as Error).message || '';
      log.error('[userTemplatesContract.instantiate] Error:', error);
      if (message.includes('not found')) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Vorlage nicht gefunden.' },
        };
      }
      if (message.includes('Not authorized')) {
        return {
          status: 403 as const,
          body: { success: false, message: 'Keine Berechtigung für diese Vorlage.' },
        };
      }
      if (message.includes('no Yjs content')) {
        return {
          status: 400 as const,
          body: { success: false, message: 'Vorlage enthält keinen Inhalt zum Wiederherstellen.' },
        };
      }
      return {
        status: 500 as const,
        body: { success: false, message: 'Fehler beim Erstellen aus Vorlage.' },
      };
    }
  },
});

/**
 * Mount the ts-rest user-templates contract router. Call from routes.ts BEFORE
 * the legacy authRouter so contract routes match first. requireAuth is applied
 * at the /api/auth/user-templates prefix.
 */
export function mountUserTemplatesContractRouter(app: Application): void {
  createExpressEndpoints(userTemplatesContract, userTemplatesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userTemplatesContract'),
  });
}
