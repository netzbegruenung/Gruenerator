/**
 * ts-rest contract router for /api/documents (Qdrant, retrieval, Wolke sync).
 *
 * Wraps the same service calls as the legacy controllers:
 *   - qdrantController.ts    → GET /system-full-text
 *   - retrievalController.ts → GET /stats
 *   - wolkeController.ts     → GET /sync-status
 *
 * Mount BEFORE the legacy documentsRouter in routes.ts so ts-rest matches
 * its own routes first; unmatched paths fall through to the legacy router.
 *
 * ## Authentication
 * All routes require authentication. `requireAuth` middleware is applied at
 * the path prefix in routes.ts before this contract is mounted, so
 * `req.user` is always present. `getUserId()` throws when it is not (safety
 * guard only — should never fire in production).
 */

import { documentsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { COLLECTION_MAP } from '../../config/collectionMap.js';
import { applyDefaultFilter } from '../../config/systemCollectionsConfig.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { DocumentSearchService } from '../../services/document-services/DocumentSearchService/index.js';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { getWolkeSyncService } from '../../services/sync/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('documentsContractRouter');

// Services (mirrors the singleton pattern in the legacy controllers)
const documentSearchService = new DocumentSearchService();
const postgresDocumentService = getPostgresDocumentService();
const wolkeSyncService = getWolkeSyncService();

/**
 * Extract the authenticated user id.
 * The requireAuth middleware in routes.ts ensures req.user is set before
 * this router is reached — this function is a safety guard only.
 */
function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    log.error(
      '[documentsContract] getUserId called with undefined req.user — middleware bypassed? url=%s',
      req.originalUrl
    );
    throw new Error('Authentication required');
  }
  return user.id;
}

// ── Contract router ────────────────────────────────────────────────────────

const s = initServer();

export const documentsContractRouter = s.router(documentsContract, {
  systemFullText: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { url, collection } = args.query as { url?: string; collection?: string };

      if (!url || !collection) {
        return {
          status: 400 as const,
          body: {
            success: false,
            message: 'Both "url" and "collection" query parameters are required',
          },
        };
      }

      const mapping = COLLECTION_MAP[collection];
      if (!mapping) {
        return {
          status: 400 as const,
          body: { success: false, message: `Unknown collection: ${collection}` },
        };
      }

      log.debug(
        `[documentsContract.systemFullText] userId=${userId} url="${url}" collection="${collection}" → ${mapping.qdrantCollection}`
      );

      const defaultFilter = applyDefaultFilter(mapping.systemId);

      const result = await documentSearchService.getSystemDocumentFullTextByUrl(
        mapping.qdrantCollection,
        url,
        defaultFilter
      );

      if (!result.success) {
        return {
          status: 404 as const,
          body: { success: false, message: result.error || 'Document not found' },
        };
      }

      return {
        status: 200 as const,
        body: {
          success: true,
          data: { fullText: result.fullText, title: result.title, url },
        },
      };
    } catch (error) {
      log.error('[documentsContract.systemFullText] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          message: (error as Error).message || 'Failed to retrieve system document text',
        },
      };
    }
  },

  getStats: async (args) => {
    try {
      const userId = getUserId(args.req);
      log.debug(`[documentsContract.getStats] Getting stats for user: ${userId}`);

      const stats = await postgresDocumentService.getDocumentStats(userId);

      return { status: 200 as const, body: { success: true, stats } };
    } catch (error) {
      log.error('[documentsContract.getStats] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          message: (error as Error).message || 'Failed to get document statistics',
        },
      };
    }
  },

  getSyncStatus: async (args) => {
    try {
      const userId = getUserId(args.req);
      log.debug(`[documentsContract.getSyncStatus] Getting sync status for user: ${userId}`);

      const syncStatuses = await wolkeSyncService.getUserSyncStatus(userId);

      return { status: 200 as const, body: { success: true, syncStatuses } };
    } catch (error) {
      log.error('[documentsContract.getSyncStatus] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          message: (error as Error).message || 'Failed to get sync status',
        },
      };
    }
  },

  getContent: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { id } = args.params;

      const document = await postgresDocumentService.getDocumentById(id, userId);
      if (!document) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Document not found or access denied' },
        };
      }

      // Full text lives in Qdrant, not the DB column. A Qdrant miss/failure
      // degrades to empty text rather than failing the whole request.
      let ocrText = '';
      try {
        const qdrantResult = await documentSearchService.getDocumentFullText(userId, id);
        if (qdrantResult.success && qdrantResult.fullText) {
          ocrText = qdrantResult.fullText;
        }
      } catch (qdrantError) {
        log.error('[documentsContract.getContent] Qdrant fetch failed:', qdrantError);
      }

      // Coalesce the nullable Drizzle columns to their schema defaults so the
      // wire shape is stable (mirrors the column defaults in the schema file).
      return {
        status: 200 as const,
        body: {
          success: true as const,
          data: {
            id: document.id,
            title: document.title,
            filename: document.filename ?? null,
            // page_count reaches DocumentRecord via its index signature (typed
            // `unknown`); narrow the real integer column back to number | null.
            page_count: typeof document.page_count === 'number' ? document.page_count : null,
            status: document.status ?? 'pending',
            vector_count: document.vector_count ?? 0,
            source_type: document.source_type ?? 'manual',
            ocr_text: ocrText,
            created_at: document.created_at,
          },
        },
      };
    } catch (error) {
      log.error('[documentsContract.getContent] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: (error as Error).message || 'Failed to get document content',
        },
      };
    }
  },

  getDocumentStatuses: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { ids } = args.body;

      const postgres = getPostgresInstance();
      const rows = (await postgres.query(
        `SELECT id, status, metadata FROM documents WHERE id = ANY($1) AND user_id = $2`,
        [ids, userId]
      )) as Array<{
        id: string;
        status: string;
        metadata: Record<string, unknown> | string | null;
      }>;

      // IDs not owned by the caller are silently omitted (don't leak existence).
      // Unknown status strings get normalized to 'pending' — defensive against
      // legacy rows or future statuses that haven't been added to the enum yet.
      const allowedStatuses = new Set(['pending', 'uploaded', 'processing', 'completed', 'failed']);
      const allowedStages = new Set(['extracting', 'chunking', 'upserting']);

      const statuses = rows.map((r) => {
        const meta =
          typeof r.metadata === 'string'
            ? (JSON.parse(r.metadata) as Record<string, unknown>)
            : ((r.metadata ?? {}) as Record<string, unknown>);

        const rawStage = meta.processing_stage as string | null | undefined;
        const stage =
          rawStage && allowedStages.has(rawStage)
            ? (rawStage as 'extracting' | 'chunking' | 'upserting')
            : null;

        const rawProgress = meta.processing_progress as
          | { stage?: string; current?: number; total?: number }
          | null
          | undefined;
        const progress =
          rawProgress &&
          typeof rawProgress.stage === 'string' &&
          allowedStages.has(rawProgress.stage) &&
          typeof rawProgress.current === 'number' &&
          typeof rawProgress.total === 'number'
            ? {
                stage: rawProgress.stage as 'extracting' | 'chunking' | 'upserting',
                current: rawProgress.current,
                total: rawProgress.total,
              }
            : null;

        return {
          id: r.id,
          status: (allowedStatuses.has(r.status) ? r.status : 'pending') as
            | 'pending'
            | 'uploaded'
            | 'processing'
            | 'completed'
            | 'failed',
          stage,
          progress,
        };
      });

      return { status: 200 as const, body: { success: true, statuses } };
    } catch (error) {
      log.error('[documentsContract.getDocumentStatuses] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          message: (error as Error).message || 'Failed to get document statuses',
        },
      };
    }
  },
});

/**
 * Mount the ts-rest documents contract router onto an Express app.
 * Call this from routes.ts BEFORE mounting the legacy documentsRouter.
 *
 * `requireAuth` middleware MUST be applied at the /api/documents path prefix
 * in routes.ts before calling this function — all 3 routes require authentication.
 */
export function mountDocumentsContractRouter(app: Application): void {
  createExpressEndpoints(documentsContract, documentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'documentsContract'),
  });
}
