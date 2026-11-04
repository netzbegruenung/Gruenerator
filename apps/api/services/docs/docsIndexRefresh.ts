/**
 * Loads the chat's docs index from the LIVE docs site (#5013).
 *
 * The doku image and the API image are rolled out separately. An index bundled
 * with the API therefore drifts from the site: the chat cited pages the site
 * did not have, and before nginx served real 404s those links silently landed
 * on the start page. The docs build writes `docs-index.json` next to the pages
 * it built (`documentation` `build` → generate-docs-index.mjs --json), so the
 * index fetched here describes exactly the site that is serving the links.
 *
 * The bundled `docsIndex.generated.ts` stays the fallback: until the first
 * fetch succeeds, when the site is down, and when the file has a format this
 * code does not know (`version`). A failed refresh keeps the last good index.
 */

import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';

import { DOCS_SITE_URL } from './docsIndex.generated.js';
import { docsIndexStats, replaceDocsIndex } from './docsIndex.js';

const log = createLogger('docsIndex');

export const DOCS_INDEX_URL = `${DOCS_SITE_URL}/docs-index.json`;

/** A doku rollout reaches the chat within this long. Unchanged polls are 304s. */
const REFRESH_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15_000;

const docsIndexFileSchema = z.object({
  version: z.literal(1),
  pages: z
    .array(
      z.object({
        url: z.string().startsWith('/docs/'),
        title: z.string(),
        category: z.string(),
        lead: z.string(),
      })
    )
    .min(1),
  sections: z
    .array(
      z.object({
        url: z.string().startsWith('/docs/'),
        pageTitle: z.string(),
        heading: z.string(),
        anchor: z.string(),
        category: z.string(),
        text: z.string(),
      })
    )
    .min(1),
});

let etag: string | null = null;
let failing = false;
let timer: NodeJS.Timeout | null = null;

export type DocsIndexRefreshResult = 'updated' | 'unchanged' | 'failed';

export async function refreshDocsIndex(): Promise<DocsIndexRefreshResult> {
  try {
    const res = await fetch(DOCS_INDEX_URL, {
      headers: etag ? { 'If-None-Match': etag } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 304) {
      failing = false;
      return 'unchanged';
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const parsed = docsIndexFileSchema.safeParse(await res.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`unexpected format at ${issue?.path.join('.')}: ${issue?.message}`);
    }

    replaceDocsIndex(parsed.data);
    etag = res.headers.get('etag');
    failing = false;
    const stats = docsIndexStats();
    log.info(`Loaded live docs index: ${stats.pages} pages, ${stats.sections} sections`);
    return 'updated';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Once per failure streak, not every ten minutes in every worker.
    if (!failing) log.warn(`Keeping current docs index, ${DOCS_INDEX_URL} failed: ${message}`);
    failing = true;
    return 'failed';
  }
}

/** Per cluster worker: each keeps its own in-process index. */
export function startDocsIndexRefresh(): void {
  if (timer) return;
  void refreshDocsIndex();
  timer = setInterval(() => void refreshDocsIndex(), REFRESH_MS);
  timer.unref?.();
}
