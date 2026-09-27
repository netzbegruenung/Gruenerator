/**
 * WordPress-site notebook source: category discovery + post import via the
 * public WP REST API (`/wp-json/wp/v2`).
 *
 * Imports are user-scoped and upload-first: each post becomes a `documents`
 * row with status 'uploaded' whose cleaned text is written to the pending-
 * uploads dir — chunking/embedding runs later through the regular
 * triggerPendingDocProcessing path when the notebook is saved, exactly like
 * manual uploads. Posts are fetched with `_fields=...content` so no per-post
 * page scrape is needed (unlike the Landesverband scraper's link-only mode).
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { NOTEBOOK_MAX_DOCUMENTS } from '@gruenerator/contracts';
import * as cheerio from 'cheerio';
import { and, eq } from 'drizzle-orm';

import { documents } from '../../database/schema/documents.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { parseMetadata } from '../../routes/documents/helpers.js';
import { createLogger } from '../../utils/logger.js';
import { safeFetch } from '../../utils/validation/urlSecurity.js';
import { getQdrantDocumentService } from '../document-services/DocumentSearchService/index.js';
import { getPostgresDocumentService } from '../document-services/PostgresDocumentService/index.js';
import { cleanText, stripHtmlTags } from '../scrapers/utils/htmlCleaner.js';

import type {
  WpDiscoveredCategory,
  WpDiscoveredPage,
  WpErrorCode,
  WpImportResultItem,
} from '@gruenerator/contracts';

const log = createLogger('notebook:wordpress-source');

const USER_AGENT = 'Gruenerator-Notebook/1.0 (+https://gruenerator.eu)';
const FETCH_TIMEOUT_MS = 10_000;
const REQUEST_DELAY_MS = 300;
const POSTS_PER_SCOPE = 50;
const INCREMENTAL_MAX_PAGES = 3;
const CATEGORY_MAX_PAGES = 5;
/** WP REST caps per_page at 100; page listing therefore tops out at 500 entries. */
const WP_MAX_PER_PAGE = 100;
const PAGE_LIST_MAX_PAGES = 5;

// Same target as manualController's PENDING_UPLOADS_DIR (routes/documents and
// services/notebook sit at equal depth below apps/api).
const PENDING_UPLOADS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../uploads/pending'
);

export class WpSourceError extends Error {
  code: WpErrorCode;

  constructor(code: WpErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type WpScope =
  | { kind: 'category'; id: number; name: string }
  | { kind: 'allPosts' }
  /** `ids: null` (or empty) imports every page; otherwise only the listed ones. */
  | { kind: 'pages'; ids: number[] | null };

export interface WpDiscoverResult {
  site: { url: string; name: string };
  categories: WpDiscoveredCategory[];
  pages: WpDiscoveredPage[];
  totalPosts: number;
  totalPages: number;
}

export interface WpImportOutcome {
  results: WpImportResultItem[];
  removedDocumentIds: string[];
}

interface WpPost {
  id: number;
  link: string;
  title?: { rendered?: string };
  content?: { rendered?: string; protected?: boolean };
  modified?: string;
  date?: string;
  categories?: number[];
}

export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new WpSourceError('invalid_url', 'Ungültige URL');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

async function wpFetch(url: string): Promise<Response> {
  try {
    // safeFetch validates the URL and re-validates every redirect hop (SSRF).
    return await safeFetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('URL validation failed')) {
      throw new WpSourceError('invalid_url', 'URL nicht erlaubt');
    }
    throw new WpSourceError('fetch_failed', `Website nicht erreichbar: ${message}`);
  }
}

/**
 * Fetch a WP API URL and parse JSON, classifying WP-style failures.
 * Returns the response headers alongside the body for pagination totals.
 */
async function wpFetchJson(url: string): Promise<{ body: unknown; headers: Headers } | null> {
  const res = await wpFetch(url);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON body from a wp-json URL → not a (usable) WordPress site.
    throw new WpSourceError(
      'not_wordpress',
      'Unter dieser Adresse ist keine WordPress-REST-API erreichbar'
    );
  }
  if (!res.ok) {
    const errCode =
      body && typeof body === 'object' && 'code' in body
        ? String((body as { code: unknown }).code)
        : '';
    if (errCode === 'rest_post_invalid_page_number') return null;
    if (res.status === 401 || res.status === 403 || errCode.startsWith('rest_')) {
      throw new WpSourceError(
        'rest_disabled',
        'Die WordPress-REST-API dieser Website ist deaktiviert oder geschützt'
      );
    }
    throw new WpSourceError('not_wordpress', `WordPress-API-Fehler (HTTP ${res.status})`);
  }
  return { body, headers: res.headers };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTotal(siteUrl: string, resource: 'posts' | 'pages'): Promise<number> {
  try {
    const result = await wpFetchJson(`${siteUrl}/wp-json/wp/v2/${resource}?per_page=1&_fields=id`);
    return result ? Number(result.headers.get('x-wp-total') || 0) : 0;
  } catch {
    return 0;
  }
}

async function fetchCategories(siteUrl: string): Promise<WpDiscoveredCategory[]> {
  const categories: WpDiscoveredCategory[] = [];
  for (let page = 1; page <= CATEGORY_MAX_PAGES; page++) {
    const result = await wpFetchJson(
      `${siteUrl}/wp-json/wp/v2/categories?per_page=100&page=${page}&_fields=id,name,count,parent`
    );
    if (!result) break;
    if (!Array.isArray(result.body)) {
      throw new WpSourceError('not_wordpress', 'Unerwartete Antwort der WordPress-API');
    }
    for (const cat of result.body as Array<Record<string, unknown>>) {
      if (typeof cat.id === 'number' && typeof cat.name === 'string') {
        categories.push({
          id: cat.id,
          name: stripHtmlTags(cat.name),
          count: typeof cat.count === 'number' ? cat.count : 0,
          parent: typeof cat.parent === 'number' ? cat.parent : null,
        });
      }
    }
    const totalPages = Number(result.headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages || result.body.length < 100) break;
    await delay(REQUEST_DELAY_MS);
  }
  return categories.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
}

/**
 * The site's pages, for the selection dropdown. Also yields the total via the
 * pagination header, so no extra count request is needed.
 */
async function fetchPageList(
  siteUrl: string
): Promise<{ pages: WpDiscoveredPage[]; total: number }> {
  const pages: WpDiscoveredPage[] = [];
  let total = 0;
  for (let page = 1; page <= PAGE_LIST_MAX_PAGES; page++) {
    const result = await wpFetchJson(
      `${siteUrl}/wp-json/wp/v2/pages?per_page=100&page=${page}&_fields=id,title&orderby=title&order=asc`
    );
    if (!result || !Array.isArray(result.body)) break;
    if (page === 1) total = Number(result.headers.get('x-wp-total') || 0);
    for (const entry of result.body as Array<Record<string, unknown>>) {
      if (typeof entry.id !== 'number') continue;
      const rendered =
        entry.title && typeof entry.title === 'object'
          ? (entry.title as { rendered?: unknown }).rendered
          : null;
      const title =
        typeof rendered === 'string' && rendered.trim()
          ? stripHtmlTags(rendered.trim())
          : `Seite ${entry.id}`;
      pages.push({ id: entry.id, title });
    }
    const totalPages = Number(result.headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages || result.body.length < 100) break;
    await delay(REQUEST_DELAY_MS);
  }
  return { pages, total: total || pages.length };
}

async function fetchSiteName(siteUrl: string): Promise<string> {
  const fallback = new URL(siteUrl).hostname;
  try {
    const root = await wpFetchJson(`${siteUrl}/wp-json/?_fields=name`);
    const name =
      root && root.body && typeof root.body === 'object'
        ? (root.body as { name?: unknown }).name
        : null;
    return typeof name === 'string' && name.trim() ? stripHtmlTags(name.trim()) : fallback;
  } catch {
    // Root index unavailable — hostname fallback is fine.
    return fallback;
  }
}

export async function discoverWordpressSite(rawUrl: string): Promise<WpDiscoverResult> {
  const siteUrl = normalizeSiteUrl(rawUrl);

  // Independent request streams — running them concurrently keeps discovery
  // roughly as fast as before despite additionally listing every page.
  const [categories, pageList, siteName, totalPosts] = await Promise.all([
    fetchCategories(siteUrl),
    fetchPageList(siteUrl),
    fetchSiteName(siteUrl),
    fetchTotal(siteUrl, 'posts'),
  ]);

  return {
    site: { url: siteUrl, name: siteName },
    categories,
    pages: pageList.pages,
    totalPosts,
    totalPages: pageList.total,
  };
}

/**
 * HTML → plain text preserving paragraph boundaries (the chunker relies on
 * them). Block-level elements are joined with blank lines; entities are
 * decoded by cheerio.
 */
export function wpHtmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, iframe, noscript, form, svg').remove();
  const blocks: string[] = [];
  const blockSelector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, td';
  $(blockSelector).each((_, el) => {
    // Skip nested blocks (e.g. p inside blockquote) — the outermost wins.
    if ($(el).parents(blockSelector).length > 0) return;
    const text = cleanText($(el).text());
    if (text) blocks.push(text);
  });
  if (blocks.length === 0) {
    const fallback = cleanText($.root().text());
    return fallback;
  }
  return blocks.join('\n\n');
}

export function buildScopeUrls(
  siteUrl: string,
  scopes: WpScope[],
  modifiedAfter: string | null
): string[] {
  const fields = '_fields=id,link,title,content,modified,date,categories';
  const incremental = modifiedAfter
    ? `&modified_after=${encodeURIComponent(modifiedAfter)}&orderby=modified&order=desc`
    : '&orderby=date&order=desc';
  return scopes.flatMap((scope) => {
    // Explicitly picked pages are all wanted, so they are requested by id in
    // chunks of the WP per_page maximum rather than capped at POSTS_PER_SCOPE.
    if (scope.kind === 'pages' && scope.ids && scope.ids.length > 0) {
      const chunks: string[] = [];
      for (let i = 0; i < scope.ids.length; i += WP_MAX_PER_PAGE) {
        const chunk = scope.ids.slice(i, i + WP_MAX_PER_PAGE);
        chunks.push(
          `${siteUrl}/wp-json/wp/v2/pages?per_page=${chunk.length}&include=${chunk.join(',')}&${fields}${incremental}`
        );
      }
      return chunks;
    }
    const resource = scope.kind === 'pages' ? 'pages' : 'posts';
    const categoryFilter = scope.kind === 'category' ? `&categories=${scope.id}` : '';
    return [
      `${siteUrl}/wp-json/wp/v2/${resource}?per_page=${POSTS_PER_SCOPE}${categoryFilter}&${fields}${incremental}`,
    ];
  });
}

async function fetchScopePosts(baseUrl: string, incremental: boolean): Promise<WpPost[]> {
  const posts: WpPost[] = [];
  const maxPages = incremental ? INCREMENTAL_MAX_PAGES : 1;
  for (let page = 1; page <= maxPages; page++) {
    const result = await wpFetchJson(`${baseUrl}&page=${page}`);
    if (!result || !Array.isArray(result.body)) break;
    posts.push(...(result.body as WpPost[]));
    if (result.body.length < POSTS_PER_SCOPE) break;
    if (page < maxPages) await delay(REQUEST_DELAY_MS);
  }
  return posts;
}

async function findExistingDocument(
  userId: string,
  sourceUrl: string
): Promise<{ id: string; wpModified: string | null } | null> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ id: documents.id, metadata: documents.metadata })
    .from(documents)
    .where(
      and(
        eq(documents.user_id, userId),
        eq(documents.source_type, 'wordpress'),
        eq(documents.source_url, sourceUrl)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const meta = parseMetadata(row.metadata);
  const wpModified = typeof meta.wp_modified === 'string' ? meta.wp_modified : null;
  return { id: row.id, wpModified };
}

async function deleteDocumentFully(documentId: string, userId: string): Promise<void> {
  try {
    await getQdrantDocumentService().deleteDocumentVectors(documentId, userId);
  } catch (error) {
    log.warn(`Vector deletion failed for ${documentId} (continuing):`, error);
  }
  await getPostgresDocumentService().deleteDocument(documentId, userId);
  // Notebook membership lives in Qdrant, so nothing cascades. Leaving the join
  // point behind is self-defeating here: the next sync asks
  // `findReferencedDocumentIds` whether this document is still in use, and its
  // own leftover answers yes.
  await new NotebookQdrantHelper().removeDocumentsFromAllCollections([documentId]);
}

function slugifyFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] || c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'beitrag'
  );
}

async function createWordpressDocument(
  userId: string,
  siteUrl: string,
  post: WpPost,
  title: string,
  text: string
): Promise<string> {
  const content = `# ${title}\n\n${post.link}\n\n${text}`;
  const dir = path.join(PENDING_UPLOADS_DIR, userId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${slugifyFilename(title)}.md`;
  const filePath = path.join(dir, `${randomUUID()}-${filename}`);
  fs.writeFileSync(filePath, content, 'utf-8');

  const record = await getPostgresDocumentService().saveDocumentMetadata(userId, {
    title,
    filename,
    sourceType: 'wordpress',
    vectorCount: 0,
    fileSize: Buffer.byteLength(content, 'utf-8'),
    status: 'uploaded',
    sourceUrl: post.link,
    // The text is already in hand here, so it is stored right away rather than
    // after processing: the site never has to be fetched a second time, and it
    // survives even if chunking later fails.
    markdownContent: content,
    additionalMetadata: {
      filePath,
      mimetype: 'text/markdown',
      wp_site: siteUrl,
      wp_post_id: post.id,
      wp_modified: post.modified ?? null,
      wp_category_ids: post.categories ?? [],
    },
  });
  return record.id;
}

export async function importWordpressPosts(
  userId: string,
  params: {
    siteUrl: string;
    scopes: WpScope[];
    modifiedAfter?: string | null;
    knownDocumentIds?: string[] | null;
    maxNewDocuments?: number | null;
  }
): Promise<WpImportOutcome> {
  const siteUrl = normalizeSiteUrl(params.siteUrl);
  const modifiedAfter = params.modifiedAfter ?? null;
  const budget = Math.max(
    0,
    Math.min(params.maxNewDocuments ?? NOTEBOOK_MAX_DOCUMENTS, NOTEBOOK_MAX_DOCUMENTS)
  );

  const seenLinks = new Set<string>();
  const posts: WpPost[] = [];
  const scopeUrls = buildScopeUrls(siteUrl, params.scopes, modifiedAfter);
  for (let i = 0; i < scopeUrls.length; i++) {
    if (i > 0) await delay(REQUEST_DELAY_MS);
    const scopePosts = await fetchScopePosts(scopeUrls[i], modifiedAfter !== null);
    for (const post of scopePosts) {
      if (!post?.link || seenLinks.has(post.link)) continue;
      seenLinks.add(post.link);
      posts.push(post);
    }
  }

  log.info(
    `Import for ${siteUrl}: ${posts.length} unique post(s) across ${params.scopes.length} scope(s)` +
      (modifiedAfter ? ` (modified after ${modifiedAfter})` : '')
  );

  const results: WpImportResultItem[] = [];
  let createdCount = 0;

  for (const post of posts) {
    const title = cleanText(stripHtmlTags(post.title?.rendered || '')) || post.link;
    try {
      if (post.content?.protected || !post.content?.rendered) {
        results.push({
          documentId: null,
          title,
          sourceUrl: post.link,
          action: 'failed',
          error: 'Inhalt geschützt oder leer',
        });
        continue;
      }

      const existing = await findExistingDocument(userId, post.link);
      if (existing && existing.wpModified && existing.wpModified === (post.modified ?? null)) {
        results.push({
          documentId: existing.id,
          title,
          sourceUrl: post.link,
          action: 'unchanged',
        });
        continue;
      }

      const text = wpHtmlToText(post.content.rendered);
      if (text.length < 50) {
        results.push({
          documentId: existing?.id ?? null,
          title,
          sourceUrl: post.link,
          action: existing ? 'unchanged' : 'failed',
          error: existing ? null : 'Zu wenig Textinhalt',
        });
        continue;
      }

      if (!existing && createdCount >= budget) {
        results.push({
          documentId: null,
          title,
          sourceUrl: post.link,
          action: 'skipped_full',
        });
        continue;
      }

      if (existing) {
        await deleteDocumentFully(existing.id, userId);
      }
      const documentId = await createWordpressDocument(userId, siteUrl, post, title, text);
      if (!existing) createdCount++;
      results.push({
        documentId,
        title,
        sourceUrl: post.link,
        action: existing ? 'updated' : 'created',
        oldDocumentId: existing?.id ?? null,
      });
    } catch (error) {
      log.warn(`Failed to import ${post.link}:`, error);
      results.push({
        documentId: null,
        title,
        sourceUrl: post.link,
        action: 'failed',
        error: (error as Error).message,
      });
    }
  }

  // Full runs report removals: previously imported docs whose posts no longer
  // appear in the selection. Incremental runs can't (WP has no deletion feed).
  const removedDocumentIds: string[] = [];
  if (modifiedAfter === null && params.knownDocumentIds?.length) {
    const keptIds = new Set(
      results.flatMap((r) => [r.documentId, r.oldDocumentId]).filter(Boolean) as string[]
    );
    const stale = params.knownDocumentIds.filter((id) => !keptIds.has(id));

    // A deselected post is always unlinked from the calling notebook, but it may
    // be the very same document another notebook imported — the importer reuses
    // documents across notebooks rather than copying them. Deleting outright
    // would destroy it there too, so only unreferenced documents are erased.
    const stillReferenced = await new NotebookQdrantHelper().findReferencedDocumentIds(stale);

    for (const known of stale) {
      removedDocumentIds.push(known);
      if (stillReferenced.has(known)) continue;
      try {
        await deleteDocumentFully(known, userId);
      } catch (error) {
        log.warn(`Could not remove stale doc ${known}:`, error);
      }
    }
  }

  return { results, removedDocumentIds };
}
