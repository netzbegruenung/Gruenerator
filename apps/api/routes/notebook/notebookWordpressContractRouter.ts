/**
 * ts-rest contract router for the notebook WordPress-source endpoints.
 *
 * User-scoped, upload-first (see notebookWordpressContract): discover probes a
 * site's WP REST API, import creates user-owned 'uploaded' documents that the
 * caller attaches to a notebook at save time. requireAuth is applied at the
 * /api/auth/notebook-wordpress prefix in routes.ts.
 */
import { notebookWordpressContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  discoverWordpressSite,
  importWordpressPosts,
  WpSourceError,
  type WpScope,
} from '../../services/notebook/wordpressSourceService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { WpErrorResponse } from '@gruenerator/contracts';
import type { Application, Request } from 'express';

const log = createLogger('notebookWordpressContractRouter');

/** Safety guard — requireAuth at the prefix guarantees req.user is set. */
function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user.id;
}

type WpErrorResult =
  | { status: 400; body: WpErrorResponse }
  | { status: 422; body: WpErrorResponse }
  | { status: 500; body: WpErrorResponse };

function toErrorResponse(error: unknown): WpErrorResult {
  if (error instanceof WpSourceError) {
    const body: WpErrorResponse = { error: error.message, code: error.code };
    return error.code === 'invalid_url'
      ? { status: 400 as const, body }
      : { status: 422 as const, body };
  }
  return {
    status: 500 as const,
    body: { error: 'Interner Fehler', code: 'internal' },
  };
}

const s = initServer();

export const notebookWordpressContractRouter = s.router(notebookWordpressContract, {
  discoverSite: async (args) => {
    try {
      const userId = getUserId(args.req);
      log.info(`[discoverSite] user=${userId} url=${args.body.site_url}`);
      const result = await discoverWordpressSite(args.body.site_url);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          site: result.site,
          categories: result.categories,
          total_posts: result.totalPosts,
          total_pages: result.totalPages,
        },
      };
    } catch (error) {
      if (!(error instanceof WpSourceError)) {
        log.error('[discoverSite] Error:', error);
      }
      return toErrorResponse(error);
    }
  },

  importSite: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { body } = args;

      const scopes: WpScope[] = [
        ...body.categories.map((c) => ({ kind: 'category' as const, id: c.id, name: c.name })),
        ...(body.all_posts ? [{ kind: 'allPosts' as const }] : []),
        ...(body.pages ? [{ kind: 'pages' as const }] : []),
      ];
      if (scopes.length === 0) {
        return {
          status: 400 as const,
          body: { error: 'Keine Kategorien ausgewählt', code: 'invalid_url' as const },
        };
      }

      log.info(
        `[importSite] user=${userId} url=${body.site_url} scopes=${scopes.length} incremental=${Boolean(body.modified_after)}`
      );

      const outcome = await importWordpressPosts(userId, {
        siteUrl: body.site_url,
        scopes,
        modifiedAfter: body.modified_after ?? null,
        knownDocumentIds: body.known_document_ids ?? [],
        maxNewDocuments: body.max_new_documents ?? undefined,
      });

      const count = (action: string) => outcome.results.filter((r) => r.action === action).length;

      return {
        status: 200 as const,
        body: {
          success: true as const,
          results: outcome.results,
          removed_document_ids: outcome.removedDocumentIds,
          created_count: count('created'),
          updated_count: count('updated'),
          unchanged_count: count('unchanged'),
          failed_count: count('failed'),
          skipped_count: count('skipped_full'),
        },
      };
    } catch (error) {
      if (!(error instanceof WpSourceError)) {
        log.error('[importSite] Error:', error);
      }
      return toErrorResponse(error);
    }
  },
});

/**
 * Mount the ts-rest notebook-WordPress contract router. requireAuth must be
 * applied at the path prefix in routes.ts before calling this.
 */
export function mountNotebookWordpressContractRouter(app: Application): void {
  createExpressEndpoints(notebookWordpressContract, notebookWordpressContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'notebookWordpressContract'),
  });
}
