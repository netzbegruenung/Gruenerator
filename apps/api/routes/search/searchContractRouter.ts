/**
 * ts-rest router for /api/search (Phase 4.1 pilot)
 *
 * Covers only the two endpoints that are in the pilot `searchContract`:
 *   - POST /api/search           → normal web search (with optional AI summary)
 *   - GET  /api/search/status    → SearXNG health check
 *
 * The deep-research and analyze endpoints, plus the SSE streaming mode, are
 * intentionally left on the legacy Express router (searchController.ts). Their
 * response shapes are AI-generated and evolve too quickly for a tight contract.
 *
 * Non-JSON request bodies for the streaming variant are handled by the
 * fallthrough to the legacy Express router: ts-rest matches its own routes
 * first; if the request has `?stream=true` we bail out and let the legacy
 * handler pick it up via Express routing (ts-rest runs before it).
 */

import { searchContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { env } from '../../config/env.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

import type {
  WebSearchInput,
  NormalSearchOutput,
  SearchOptions,
} from '../../agents/langgraph/WebSearchGraph/types.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { Application } from 'express';

const log = createLogger('searchContract');

const s = initServer();

function getUserId(req: AuthenticatedRequest): string {
  return req.user?.id || req.user?.keycloak_id || 'anonymous';
}

function mapErrorToUserMessage(error: Error): string {
  const message = error.message;
  if (message.includes('timeout')) {
    return 'Die Suche hat zu lange gedauert. Bitte versuchen Sie es erneut.';
  }
  if (message.includes('network') || message.includes('ENOTFOUND')) {
    return 'Netzwerkfehler. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.';
  }
  if (message.includes('SearXNG')) {
    return 'Suchmaschine temporär nicht verfügbar. Bitte versuchen Sie es später erneut.';
  }
  return 'Websuche fehlgeschlagen';
}

export const searchContractRouter = s.router(searchContract, {
  search: async ({ body, req }) => {
    const startTime = Date.now();

    try {
      const {
        query,
        includeSummary = false,
        maxResults = 10,
        language = 'de-DE',
        timeRange,
        safesearch = 0,
        categories = 'general',
      } = body;

      // Streaming mode is not modelled by the pilot contract — defer to the
      // legacy Express router by returning 400 so clients know to not use
      // ts-rest for streaming. In practice the frontend routes streaming
      // through the legacy path directly.
      if (req.query.stream === 'true') {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            error:
              'Streaming mode is not supported on the contract endpoint — use legacy /api/search?stream=true',
            metadata: { timestamp: new Date().toISOString(), searchType: 'normal' },
          },
        };
      }

      const trimmedQuery = query.trim();

      if (trimmedQuery.length < 2) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            error: 'Suchbegriff muss mindestens 2 Zeichen lang sein',
            metadata: { timestamp: new Date().toISOString(), searchType: 'normal' },
          },
        };
      }

      if (trimmedQuery.length > 500) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            error: 'Suchbegriff ist zu lang (max. 500 Zeichen)',
            metadata: { timestamp: new Date().toISOString(), searchType: 'normal' },
          },
        };
      }

      const userId = getUserId(req as unknown as AuthenticatedRequest);
      log.debug(
        `[Search Contract] Normal search: "${trimmedQuery}" (userId: ${userId}, summary: ${includeSummary})`
      );

      const { runWebSearch } = await import('../../agents/langgraph/WebSearchGraph/index.js');

      const searchOptions: SearchOptions = {
        maxResults: Math.min(Math.max(1, parseInt(String(maxResults)) || 10), 20),
        language: language || 'de-DE',
        safesearch: Math.min(Math.max(0, parseInt(String(safesearch)) || 0), 2),
        categories: categories || 'general',
        time_range: timeRange,
      };

      const searchInput: WebSearchInput = {
        query: trimmedQuery,
        mode: 'normal',
        user_id: userId,
        searchOptions,
        aiWorkerPool: getAIWorkerPool(req),
        req,
      };

      const searchResults = (await runWebSearch(searchInput)) as NormalSearchOutput;

      if (searchResults.status !== 'success') {
        log.error(`[Search Contract] Search failed: ${searchResults.error}`);
        const errorBody: {
          success: false;
          error: string;
          metadata: unknown;
          details?: string;
        } = {
          success: false as const,
          error: 'Websuche fehlgeschlagen',
          metadata: { timestamp: new Date().toISOString(), searchType: 'normal' },
        };
        if (env.NODE_ENV === 'development' && searchResults.error != null) {
          errorBody.details = searchResults.error;
        }
        return { status: 500 as const, body: errorBody };
      }

      const processingTime = Date.now() - startTime;
      log.debug(
        `[Search Contract] Normal search completed: ${searchResults.results?.length || 0} results, ${processingTime}ms`
      );

      // Map the agent result types (which carry document_id / source_url /
      // chunk_text / snippet / domain) to the contract's narrower wire shape
      // (url / title / content). We lose some fields on purpose — the pilot
      // contract deliberately models only the common denominator.
      const mappedResults = (searchResults.results || []).map((r) => ({
        url: r.url,
        title: r.title,
        ...(r.content != null && { content: r.content }),
        ...(r.score != null && { score: r.score }),
        ...(r.snippet != null && { excerpt: r.snippet }),
      }));

      const mappedCitations =
        searchResults.citations && searchResults.citations.length > 0
          ? searchResults.citations.map((c, i) => ({
              index: Number.parseInt(String(c.index), 10) || i + 1,
              url: c.source_url ?? '',
              title: c.document_title ?? '',
            }))
          : undefined;

      const mappedSources =
        searchResults.citationSources && searchResults.citationSources.length > 0
          ? searchResults.citationSources.map((s) => ({
              url: s.source_url ?? '',
              title: s.document_title,
              ...(s.chunk_text != null && { content: s.chunk_text }),
            }))
          : undefined;

      const responseBody: {
        success: true;
        query: string;
        results: typeof mappedResults;
        resultCount: number;
        searchEngine: string;
        summary?: { text?: string; generated?: boolean };
        citations?: typeof mappedCitations;
        sources?: typeof mappedSources;
        metadata: Record<string, unknown> & {
          processingTimeMs: number;
          timestamp: string;
          searchType: string;
          includedSummary: boolean;
        };
      } = {
        success: true as const,
        query: searchResults.query,
        results: mappedResults,
        resultCount: mappedResults.length,
        searchEngine: 'searxng-langgraph',
        metadata: {
          ...searchResults.metadata,
          processingTimeMs: processingTime,
          timestamp: new Date().toISOString(),
          searchType: 'normal',
          includedSummary: !!searchResults.summary,
        },
      };

      if (searchResults.summary) {
        responseBody.summary = { text: searchResults.summary, generated: true };
      }

      if (mappedCitations) {
        responseBody.citations = mappedCitations;
      }

      if (mappedSources) {
        responseBody.sources = mappedSources;
      }

      return { status: 200 as const, body: responseBody };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      log.error(`[Search Contract] Normal search error (${processingTime}ms):`, error);

      const userError = mapErrorToUserMessage(error as Error);
      const errorBody: {
        success: false;
        error: string;
        metadata: unknown;
        details?: string;
      } = {
        success: false as const,
        error: userError,
        metadata: {
          processingTimeMs: processingTime,
          timestamp: new Date().toISOString(),
          searchType: 'normal',
        },
      };
      if (env.NODE_ENV === 'development') {
        errorBody.details = (error as Error).message;
      }
      return { status: 500 as const, body: errorBody };
    }
  },

  status: async () => {
    try {
      const { searxngService } = await import('../../services/search/index.js');
      const status = await searxngService.getServiceStatus();

      return {
        status: 200 as const,
        body: {
          success: true,
          status: 'operational',
          service: 'LangGraph Web Search',
          searxng: status,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log.error('[Search Contract] Status check failed:', error);
      const body: {
        success: boolean;
        status: string;
        service: string;
        timestamp: string;
        error?: string;
        details?: string;
      } = {
        success: false,
        status: 'error',
        service: 'LangGraph Web Search',
        error: 'Service status check failed',
        timestamp: new Date().toISOString(),
      };
      if (env.NODE_ENV === 'development') {
        body.details = (error as Error).message;
      }
      return { status: 503 as const, body };
    }
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 * Call this from routes.ts BEFORE the legacy `/api/search` router so
 * ts-rest matches its own routes first; unmatched paths fall through.
 */
export function mountSearchContractRouter(app: Application): void {
  createExpressEndpoints(searchContract, searchContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'searchContract'),
  });
}
