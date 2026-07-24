/**
 * Websites connected to a user account.
 *
 * The table is the catalogue — identity plus the last discovery snapshot. How
 * much of a site already sits in the user's notebooks is NOT stored: it is
 * derived per request from the documents themselves, so a counter can never
 * drift away from reality.
 *
 * The derivation spans two stores: which documents came from a site is a
 * Postgres fact (documents.metadata->>'wp_site', written by the WordPress
 * import), while which notebook holds a document lives in Qdrant.
 */

import { and, eq, sql } from 'drizzle-orm';

import { documents } from '../../database/schema/documents.js';
import { userWebsites, type UserWebsiteRow } from '../../database/schema/userWebsites.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { createLogger } from '../../utils/logger.js';
import {
  discoverWordpressSite,
  normalizeSiteUrl,
  WpSourceError,
} from '../notebook/wordpressSourceService.js';

import type { UserWebsite, WebsiteCategory, WebsiteUsage } from '@gruenerator/contracts';

const log = createLogger('userWebsiteService');

/** Raised when a site is connected twice; the router maps it to 409. */
export class DuplicateWebsiteError extends Error {
  constructor(siteUrl: string) {
    super(`Website bereits verbunden: ${siteUrl}`);
    this.name = 'DuplicateWebsiteError';
  }
}

interface DocumentSiteFacts {
  /** documentId → category ids it was imported under. */
  byDocument: Map<string, number[]>;
  documentsByCategory: Record<string, number>;
}

/**
 * Which of the user's documents came from a site, and under which categories.
 * `wp_site` is stored normalised by the importer, so this matches exactly.
 */
async function loadDocumentFacts(userId: string, siteUrl: string): Promise<DocumentSiteFacts> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ id: documents.id, metadata: documents.metadata })
    .from(documents)
    .where(
      and(
        eq(documents.user_id, userId),
        eq(documents.source_type, 'wordpress'),
        sql`${documents.metadata}->>'wp_site' = ${siteUrl}`
      )
    );

  const byDocument = new Map<string, number[]>();
  const documentsByCategory: Record<string, number> = {};

  for (const row of rows) {
    const meta = row.metadata ?? {};
    const raw = (meta as { wp_category_ids?: unknown }).wp_category_ids;
    const categoryIds = Array.isArray(raw)
      ? raw.filter((v): v is number => typeof v === 'number')
      : [];
    byDocument.set(String(row.id), categoryIds);
    for (const categoryId of categoryIds) {
      const key = String(categoryId);
      documentsByCategory[key] = (documentsByCategory[key] ?? 0) + 1;
    }
  }

  return { byDocument, documentsByCategory };
}

/**
 * Usage for every site at once. The notebook lookup is the expensive half, so
 * it runs a single time and is intersected per site rather than per call.
 */
async function loadUsageForSites(
  userId: string,
  siteUrls: string[]
): Promise<Map<string, WebsiteUsage>> {
  const usage = new Map<string, WebsiteUsage>();
  if (siteUrls.length === 0) return usage;

  let notebooks: Array<{ name: string; documentIds: Set<string> }> = [];
  try {
    const helper = new NotebookQdrantHelper();
    const collections = await helper.getUserNotebookCollections(userId, { limit: 200, offset: 0 });
    notebooks = collections.map((collection) => ({
      name: collection.name,
      documentIds: new Set(
        (collection.notebook_collection_documents ?? []).map((d) => String(d.document_id))
      ),
    }));
  } catch (error) {
    // Notebook lookup is decoration — a Qdrant hiccup must not break the list.
    log.warn(`[loadUsageForSites] notebook lookup failed: ${(error as Error).message}`);
  }

  for (const siteUrl of siteUrls) {
    const facts = await loadDocumentFacts(userId, siteUrl);
    const docIds = facts.byDocument;
    const matching = notebooks.filter((nb) =>
      [...docIds.keys()].some((id) => nb.documentIds.has(id))
    );

    usage.set(siteUrl, {
      documentCount: docIds.size,
      notebookCount: matching.length,
      notebookNames: matching.map((nb) => nb.name),
      documentsByCategory: facts.documentsByCategory,
    });
  }

  return usage;
}

function toUserWebsite(row: UserWebsiteRow, usage: WebsiteUsage): UserWebsite {
  return {
    id: String(row.id),
    siteUrl: row.site_url,
    siteName: row.site_name,
    platform: 'wordpress',
    categories: (row.categories ?? []) as WebsiteCategory[],
    totalPosts: row.total_posts,
    totalPages: row.total_pages,
    discoveredAt: row.discovered_at ? row.discovered_at.toISOString() : null,
    usage,
  };
}

const EMPTY_USAGE: WebsiteUsage = {
  documentCount: 0,
  notebookCount: 0,
  notebookNames: [],
  documentsByCategory: {},
};

export async function listUserWebsites(userId: string): Promise<UserWebsite[]> {
  const db = getDrizzleInstance();
  const rows = await db.select().from(userWebsites).where(eq(userWebsites.user_id, userId));

  const usage = await loadUsageForSites(
    userId,
    rows.map((r) => r.site_url)
  );

  return rows
    .map((row) => toUserWebsite(row, usage.get(row.site_url) ?? EMPTY_USAGE))
    .sort((a, b) => a.siteName.localeCompare(b.siteName, 'de'));
}

/**
 * Probe a site and store it with its category catalogue. Throws
 * DuplicateWebsiteError when the normalised URL is already connected, and
 * WpSourceError when the site is not a usable WordPress REST API.
 */
export async function addUserWebsite(userId: string, rawUrl: string): Promise<UserWebsite> {
  const siteUrl = normalizeSiteUrl(rawUrl);
  const db = getDrizzleInstance();

  const existing = await db
    .select({ id: userWebsites.id })
    .from(userWebsites)
    .where(and(eq(userWebsites.user_id, userId), eq(userWebsites.site_url, siteUrl)))
    .limit(1);
  if (existing.length > 0) throw new DuplicateWebsiteError(siteUrl);

  const discovery = await discoverWordpressSite(siteUrl);

  // Discovery takes seconds, so the check above can go stale — a second tab
  // may have inserted the same site meanwhile. The unique index is the real
  // guard; translate its violation into the same duplicate signal.
  const inserted = await db
    .insert(userWebsites)
    .values({
      user_id: userId,
      // Discovery normalises again; use its URL so the stored value is the one
      // the importer will later match documents against.
      site_url: discovery.site.url,
      site_name: discovery.site.name,
      platform: 'wordpress',
      categories: discovery.categories.map((c) => ({ id: c.id, name: c.name, count: c.count })),
      total_posts: discovery.totalPosts,
      total_pages: discovery.totalPages,
      discovered_at: new Date(),
    })
    .returning()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('user_websites_user_url_unique') || message.includes('duplicate key')) {
        throw new DuplicateWebsiteError(discovery.site.url);
      }
      throw error;
    });

  const row = inserted[0];
  if (!row) throw new Error('Website konnte nicht gespeichert werden');

  log.info(`[addUserWebsite] user=${userId} url=${row.site_url}`);
  const usage = await loadUsageForSites(userId, [row.site_url]);
  return toUserWebsite(row, usage.get(row.site_url) ?? EMPTY_USAGE);
}

/** Re-probe the category catalogue. Returns null when the site is not the user's. */
export async function refreshUserWebsite(
  userId: string,
  websiteId: string
): Promise<UserWebsite | null> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userWebsites)
    .where(and(eq(userWebsites.id, websiteId), eq(userWebsites.user_id, userId)))
    .limit(1);

  const current = rows[0];
  if (!current) return null;

  const discovery = await discoverWordpressSite(current.site_url);

  const updated = await db
    .update(userWebsites)
    .set({
      site_name: discovery.site.name,
      categories: discovery.categories.map((c) => ({ id: c.id, name: c.name, count: c.count })),
      total_posts: discovery.totalPosts,
      total_pages: discovery.totalPages,
      discovered_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(eq(userWebsites.id, websiteId), eq(userWebsites.user_id, userId)))
    .returning();

  const row = updated[0];
  if (!row) return null;

  const usage = await loadUsageForSites(userId, [row.site_url]);
  return toUserWebsite(row, usage.get(row.site_url) ?? EMPTY_USAGE);
}

/**
 * Disconnect a website. Imported documents are deliberately left alone — they
 * belong to the notebooks now, not to the connection.
 */
export async function deleteUserWebsite(userId: string, websiteId: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const deleted = await db
    .delete(userWebsites)
    .where(and(eq(userWebsites.id, websiteId), eq(userWebsites.user_id, userId)))
    .returning({ id: userWebsites.id });
  return deleted.length > 0;
}

// NOTE on reusing documents across notebooks: nothing extra is needed here.
// The importer's findExistingDocument() matches on (user_id, source_url), not
// per notebook, so a post already imported elsewhere comes back as 'unchanged'
// with its existing id and simply gets linked. Seeding the importer's
// `known_document_ids` with the user's other documents would actively break
// this: that same list drives removal on full runs, so notebook B would delete
// notebook A's documents.

export { WpSourceError };
