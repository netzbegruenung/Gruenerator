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

import * as cheerio from 'cheerio';
import { and, eq } from 'drizzle-orm';

import { documents } from '../../database/schema/documents.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { parseMetadata } from '../../routes/documents/helpers.js';
import { createLogger } from '../../utils/logger.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';
import { getQdrantDocumentService } from '../document-services/DocumentSearchService/index.js';
import { getPostgresDocumentService } from '../document-services/PostgresDocumentService/index.js';
import { cleanText, stripHtmlTags } from '../scrapers/utils/htmlCleaner.js';

import type { WpDiscoveredCategory, WpErrorCode, WpImportResultItem } from '@gruenerator/contracts';

const log = createLogger('notebook:wordpress-source');

const USER_AGENT = 'Gruenerator-Notebook/1.0 (+https://gruenerator.eu)';
const FETCH_TIMEOUT_MS = 10_000;
const REQUEST_DELAY_MS = 300;
const POSTS_PER_SCOPE = 50;
const INCREMENTAL_MAX_PAGES = 3;
const CATEGORY_MAX_PAGES = 5;

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
  | { kind: 'pages' };

export interface WpDiscoverResult {
  site: { url: string; name: string };
  categories: WpDiscoveredCategory[];
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
  const validation = await validateUrlForFetch(url);
  if (!validation.isValid || !validation.url) {
    throw new WpSourceError('invalid_url', validation.error || 'URL nicht erlaubt');
  }
  try {
    return await fetch(validation.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (error) {
    throw new WpSourceError(
      'fetch_failed',
      `Website nicht erreichbar: ${(error as Error).message}`
    );
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

export async function discoverWordpressSite(rawUrl: string): Promise<WpDiscoverResult> {
  const siteUrl = normalizeSiteUrl(rawUrl);

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

  let siteName = new URL(siteUrl).hostname;
  try {
    const root = await wpFetchJson(`${siteUrl}/wp-json/?_fields=name`);
    const name =
      root && root.body && typeof root.body === 'object'
        ? (root.body as { name?: unknown }).name
        : null;
    if (typeof name === 'string' && name.trim()) siteName = stripHtmlTags(name.trim());
  } catch {
    // Root index unavailable — hostname fallback is fine.
  }

  const [totalPosts, totalPages] = await Promise.all([
    fetchTotal(siteUrl, 'posts'),
    fetchTotal(siteUrl, 'pages'),
  ]);

  return {
    site: { url: siteUrl, name: siteName },
    categories: categories.filter((c) => c.count > 0).sort((a, b) => b.count - a.count),
    totalPosts,
    totalPages,
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

function buildScopeUrls(
  siteUrl: string,
  scopes: WpScope[],
  modifiedAfter: string | null
): string[] {
  const fields = '_fields=id,link,title,content,modified,date,categories';
  const incremental = modifiedAfter
    ? `&modified_after=${encodeURIComponent(modifiedAfter)}&orderby=modified&order=desc`
    : '&orderby=date&order=desc';
  return scopes.map((scope) => {
    const resource = scope.kind === 'pages' ? 'pages' : 'posts';
    const categoryFilter = scope.kind === 'category' ? `&categories=${scope.id}` : '';
    return `${siteUrl}/wp-json/wp/v2/${resource}?per_page=${POSTS_PER_SCOPE}${categoryFilter}&${fields}${incremental}`;
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
    modifiedAfter?: string | null | undefined;
    knownDocumentIds?: string[] | undefined;
    maxNewDocuments?: number | undefined;
  }
): Promise<WpImportOutcome> {
  const siteUrl = normalizeSiteUrl(params.siteUrl);
  const modifiedAfter = params.modifiedAfter ?? null;
  const budget = Math.max(0, Math.min(params.maxNewDocuments ?? 100, 100));

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
    for (const known of params.knownDocumentIds) {
      if (keptIds.has(known)) continue;
      try {
        await deleteDocumentFully(known, userId);
        removedDocumentIds.push(known);
      } catch (error) {
        log.warn(`Could not remove stale doc ${known}:`, error);
      }
    }
  }

  return { results, removedDocumentIds };
}
