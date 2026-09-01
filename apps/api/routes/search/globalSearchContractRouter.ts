/**
 * ts-rest router for `/api/global-search` — the unified "search everything"
 * endpoint behind the sidebar command palette.
 *
 * A single dead backend (Qdrant down → notebooks) must degrade that category to
 * empty, never fail the whole search, so every category is settled
 * independently and the casualties are named in `failedCategories`.
 *
 * URLs are built here because the slug rules and the share-token media route
 * live server-side.
 *
 * requireAuth runs on the `/api/global-search` prefix in routes.ts.
 */

import { globalSearchContract, type GlobalSearchItem } from '@gruenerator/contracts';
import { buildChatThreadSlug, buildNotebookSlug } from '@gruenerator/shared/utils';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { searchCanvases } from '../../services/canvas/canvasRepository.js';
import { buildThumbnailUrl, versionFromShareRow } from '../../services/media/thumbnailUrl.js';
import { getSharedMediaService } from '../../services/sharedMediaService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { toIsoOrNull } from '../../utils/toIsoString.js';
import { searchChatHistory } from '../chat/services/chatSearchService.js';
import {
  officeKind,
  officeSnippet,
  officeUrl,
  searchDocuments,
  searchOfficeContent,
} from '../docs/docsSearch.js';

import type { Application } from 'express';

const log = createLogger('globalSearchContract');

const s = initServer();

/** Hits per category. Five keeps the palette scannable without scrolling. */
const CATEGORY_LIMIT = 5;

const notebookHelper = new NotebookQdrantHelper();

async function findChats(userId: string, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const hits = await searchChatHistory(userId, q, { limit, ownedOnly: true });

  return hits.map((hit) => ({
    id: hit.threadId,
    type: 'chat' as const,
    title: hit.threadTitle ?? 'Unbenannter Chat',
    subtitle: hit.snippet || null,
    // Threads predating the slug backfill fall back to the raw UUID, which
    // `/chat/:threadSlug` still resolves.
    url: `/chat/${
      hit.threadSlugSuffix
        ? buildChatThreadSlug(hit.threadTitle, hit.threadSlugSuffix)
        : hit.threadId
    }`,
    thumbnailUrl: null,
    updatedAt: hit.threadUpdatedAt,
  }));
}

async function findDocs(userId: string, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const hits = await searchDocuments(userId, q, limit);
  return hits.map((hit) => ({
    id: hit.id,
    type: 'doc' as const,
    title: hit.title ?? 'Unbenanntes Dokument',
    subtitle: hit.document_subtype,
    url: `/docs/${hit.id}`,
    thumbnailUrl: null,
    updatedAt: toIsoOrNull(hit.updated_at),
  }));
}

async function findCanvases(userId: string, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const hits = await searchCanvases(userId, q, limit);
  return hits.map((hit) => ({
    id: hit.id,
    type: 'canvas' as const,
    title: hit.title,
    subtitle: hit.format ?? hit.template_type,
    url: `/studio/canvas/${hit.id}`,
    thumbnailUrl: hit.thumbnail_url,
    updatedAt: hit.updated_at,
  }));
}

/**
 * The palette renders this in a 36px chip, so it asks for the smallest signed
 * variant rather than `/api/share/<token>/preview`, which — with no `w` — the
 * route answers with the original bytes, unresized
 * (`services/media/thumbnailCache.ts`). That meant up to five multi-megabyte
 * uploads per debounced keystroke. The signed `/api/thumbs` shape is what the
 * other list endpoints already mint (`recentActivityController`); it also
 * resolves a video share to its poster frame instead of streaming the mp4.
 *
 * Null when signing is unconfigured — the row then shows its placeholder chip,
 * which is the intended fallback (an unsigned URL would 403).
 */
function mediaThumbnailUrl(item: {
  share_token: string;
  thumbnail_path?: string | null;
  created_at?: Date | string | null;
  image_metadata?: unknown;
}): string | null {
  if (!item.thumbnail_path) return null;
  return buildThumbnailUrl(
    { kind: 'media', id: item.share_token, v: versionFromShareRow(item) },
    { w: 200, fmt: 'webp' }
  );
}

async function findMedia(userId: string, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const { items } = await getSharedMediaService().getMediaLibrary(userId, { search: q, limit });
  return items.map((item) => ({
    id: item.id,
    type: 'media' as const,
    title: item.title ?? item.original_filename ?? 'Unbenanntes Medium',
    subtitle: item.alt_text ?? item.media_type ?? null,
    url: `/share/${item.share_token}`,
    thumbnailUrl: mediaThumbnailUrl(item),
    updatedAt: toIsoOrNull(item.created_at),
  }));
}

async function findNotebooks(
  userId: string,
  q: string,
  limit: number
): Promise<GlobalSearchItem[]> {
  const hits = await notebookHelper.searchUserNotebookCollections(userId, q, limit);
  return hits.map((hit) => {
    // A payload can lack `name` and still match on description.
    const title = hit.name ?? 'Unbenanntes Notebook';
    return {
      id: hit.id,
      type: 'notebook' as const,
      title,
      subtitle: hit.description,
      url: `/notebooks/${hit.slug_suffix ? buildNotebookSlug(title, hit.slug_suffix) : hit.id}`,
      thumbnailUrl: null,
      updatedAt: hit.updated_at ?? null,
    };
  });
}

async function settle(
  name: string,
  work: Promise<GlobalSearchItem[]>,
  failed: string[]
): Promise<GlobalSearchItem[]> {
  try {
    return await work;
  } catch (error) {
    log.error(`[globalSearch] category "${name}" failed:`, error);
    failed.push(name);
    return [];
  }
}

/** Cap for the composer's office search — a few more than the palette, still scannable. */
const OFFICE_SEARCH_LIMIT = 8;

/** Cap for the sidebar's thread search — a list, not a five-row palette. */
const THREAD_SEARCH_LIMIT = 20;

export const globalSearchContractRouter = s.router(globalSearchContract, {
  threadSearch: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const q = args.query.q.trim();
      // `ownedOnly` is load-bearing, not a default worth inheriting: without it
      // every is_public thread in the system matches a personal search.
      const hits = await searchChatHistory(userId, q, {
        limit: THREAD_SEARCH_LIMIT,
        ownedOnly: true,
      });
      return {
        status: 200 as const,
        body: {
          query: q,
          items: hits.map((hit) => ({
            threadId: hit.threadId,
            title: hit.threadTitle ?? 'Unbenannter Chat',
            snippet: hit.snippet,
            messageRole: hit.messageRole,
            matchedAt: hit.matchedAt,
          })),
        },
      };
    } catch (error) {
      // One source, so a DB outage must reach the client as a failure. Settling
      // it to an empty list would render as "nothing found", which is a lie.
      const err = error as Error;
      log.error('[globalSearch.threadSearch] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Thread search failed', details: err.message },
      };
    }
  },
  officeSearch: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const q = args.query.q.trim();
      const hits = await searchOfficeContent(userId, q, { limit: OFFICE_SEARCH_LIMIT });
      return {
        status: 200 as const,
        body: {
          query: q,
          items: hits.map((hit) => ({
            id: hit.id,
            kind: officeKind(hit.document_subtype),
            title: hit.title ?? 'Unbenanntes Dokument',
            snippet: officeSnippet(hit.document_subtype, hit.content),
            url: officeUrl(hit.document_subtype, hit.id),
            updatedAt: toIsoOrNull(hit.updated_at),
          })),
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[globalSearch.officeSearch] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Office search failed', details: err.message },
      };
    }
  },
  search: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const q = args.query.q.trim();
      const failedCategories: string[] = [];

      const [chats, docs, canvases, media, notebooks] = await Promise.all([
        settle('chats', findChats(userId, q, CATEGORY_LIMIT), failedCategories),
        settle('docs', findDocs(userId, q, CATEGORY_LIMIT), failedCategories),
        settle('canvases', findCanvases(userId, q, CATEGORY_LIMIT), failedCategories),
        settle('media', findMedia(userId, q, CATEGORY_LIMIT), failedCategories),
        settle('notebooks', findNotebooks(userId, q, CATEGORY_LIMIT), failedCategories),
      ]);

      return {
        status: 200 as const,
        body: {
          query: q,
          results: { chats, docs, canvases, media, notebooks },
          failedCategories,
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[globalSearch.search] Error:', err);
      return {
        status: 500 as const,
        body: { error: 'Global search failed', details: err.message },
      };
    }
  },
});

/**
 * `requireAuth` must already be applied at the `/api/global-search` prefix —
 * createExpressEndpoints registers handlers directly on the app, bypassing
 * later prefix middleware.
 */
export function mountGlobalSearchContractRouter(app: Application): void {
  createExpressEndpoints(globalSearchContract, globalSearchContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'globalSearchContract'),
  });
}
