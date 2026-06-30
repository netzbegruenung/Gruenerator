/**
 * ts-rest contract router for the external push-ingest API (`/api/v1/push/*`).
 *
 * This is the WordPress `gruenerator-sync` plugin boundary. The router is thin:
 * it authenticates the API key, enforces scope, and dispatches on `body.target`
 * to the pushIngestion service. All ingest logic lives in the service so the
 * scraper and the push path share one pipeline.
 *
 * Middleware is applied at the prefix in routes.ts, not here:
 *   - /api/v1/push/* → requireApiKey + apiKeyRateLimit('push')
 */
import { pushIngestContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getSourceById } from '../../config/landesverbaendeConfig.js';
import {
  assertLandesverbandAllowed,
  assertScope,
  type ApiKeyContext,
} from '../../middleware/apiKeyMiddleware.js';
import {
  deleteLandesverbandArticle,
  deleteNotebookArticle,
  ingestLandesverbandArticle,
  ingestNotebookArticle,
  PushIngestError,
} from '../../services/pushIngestion/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { IngestOutcome } from '../../services/pushIngestion/index.js';
import type { Request, Application } from 'express';

const log = createLogger('push-ingest');

const INGEST_SCOPE = 'ingest:articles';

/** Map a thrown error to a contract error response. */
function errorResponse(err: unknown): {
  status: 400 | 403 | 404 | 422 | 500;
  body: { error: string };
} {
  if (err instanceof PushIngestError) {
    return { status: err.status, body: { error: err.message } };
  }
  log.error('[push-ingest] unexpected error:', err);
  return { status: 500, body: { error: toError(err).message } };
}

function ingestBody(outcome: IngestOutcome) {
  return {
    ok: true as const,
    action: outcome.action,
    documentId: outcome.documentId,
    vectors: outcome.vectors,
    reason: outcome.reason,
  };
}

const s = initServer();

export const pushIngestContractRouter = s.router(pushIngestContract, {
  ping: async ({ req }) => {
    const ctx = (req as Request).apiKey;
    if (!ctx) return { status: 401 as const, body: { error: 'API key context missing' } };
    return {
      status: 200 as const,
      body: {
        ok: true as const,
        userId: ctx.userId,
        landesverbaende: ctx.scopes.landesverbaende ?? [],
        permissions: ctx.scopes.permissions ?? [],
      },
    };
  },

  ingestArticle: async ({ body, req }) => {
    const ctx = (req as Request).apiKey;
    if (!ctx) return { status: 401 as const, body: { error: 'API key context missing' } };
    if (!assertScope(ctx, INGEST_SCOPE)) {
      return { status: 403 as const, body: { error: `API key missing scope '${INGEST_SCOPE}'` } };
    }

    try {
      if (body.target === 'landesverband') {
        const source = getSourceById(body.sourceId);
        if (!source)
          return { status: 422 as const, body: { error: `Unknown sourceId: ${body.sourceId}` } };
        const allowed = assertLandesverbandAllowed(ctx as ApiKeyContext, source.shortName);
        if (!allowed.ok) return { status: 403 as const, body: { error: allowed.reason } };

        const outcome = await ingestLandesverbandArticle({
          sourceId: body.sourceId,
          contentType: body.contentType,
          sourceUrl: body.sourceUrl,
          title: body.title,
          contentText: body.contentText,
          publishedAt: body.publishedAt ?? null,
          categories: body.categories,
        });
        return { status: 200 as const, body: ingestBody(outcome) };
      }

      // target === 'notebook'
      const outcome = await ingestNotebookArticle({
        notebookId: body.notebookId,
        userId: ctx.userId,
        sourceUrl: body.sourceUrl,
        title: body.title,
        contentText: body.contentText,
      });
      return { status: 200 as const, body: ingestBody(outcome) };
    } catch (err) {
      return errorResponse(err);
    }
  },

  deleteArticle: async ({ body, req }) => {
    const ctx = (req as Request).apiKey;
    if (!ctx) return { status: 401 as const, body: { error: 'API key context missing' } };
    if (!assertScope(ctx, INGEST_SCOPE)) {
      return { status: 403 as const, body: { error: `API key missing scope '${INGEST_SCOPE}'` } };
    }

    try {
      if (body.target === 'landesverband') {
        const source = getSourceById(body.sourceId);
        if (!source)
          return { status: 404 as const, body: { error: `Unknown sourceId: ${body.sourceId}` } };
        const allowed = assertLandesverbandAllowed(ctx as ApiKeyContext, source.shortName);
        if (!allowed.ok) return { status: 403 as const, body: { error: allowed.reason } };

        const outcome = await deleteLandesverbandArticle(body.sourceId, body.sourceUrl);
        return {
          status: 200 as const,
          body: { ok: true as const, action: outcome.action, removed: outcome.removed },
        };
      }

      // target === 'notebook'
      const outcome = await deleteNotebookArticle(body.notebookId, ctx.userId, body.sourceUrl);
      return {
        status: 200 as const,
        body: { ok: true as const, action: outcome.action, removed: outcome.removed },
      };
    } catch (err) {
      return errorResponse(err);
    }
  },
});

export function mountPushIngestContractRouter(app: Application): void {
  createExpressEndpoints(pushIngestContract, pushIngestContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'pushIngestContract'),
  });
}
