/**
 * Migrate Berlin LV Wahlprogramm vectors to the curated_lists model.
 *
 * Background: berlin-lv-wahlprogramm was a separate scraper that re-fetched
 * the same TYPO3 entries under /news/ paths the BE Beschlüsse sitemap already
 * indexed under /beschluesse/. This created two Qdrant document_ids per
 * chapter. We now express the wahlprogramm tag as a curated_list overlay on
 * the canonical /beschluesse/ copy, then delete the redundant /news/ copy.
 *
 * For each known chapter URL pair:
 *   - if both copies exist: tag the /beschluesse/ copy with
 *     curated_lists: ['wahlprogramm-be'], delete the /news/ copy.
 *   - if only the /news/ copy exists: do nothing, log a warning so a human
 *     can decide whether to re-scrape via the canonical path.
 *
 * Usage:
 *   npx tsx apps/api/scripts/migrate-be-wahlprogramm.ts            # dry run
 *   npx tsx apps/api/scripts/migrate-be-wahlprogramm.ts --execute  # apply
 *
 * Requires: QDRANT_URL, QDRANT_API_KEY, QDRANT_BASIC_AUTH_USERNAME,
 * QDRANT_BASIC_AUTH_PASSWORD.
 */

import * as dotenv from 'dotenv';

dotenv.config();

import { env } from '../config/env.js';

const QDRANT_URL = (env.QDRANT_URL ?? '').replace(/\/+$/, '');
const QDRANT_API_KEY = env.QDRANT_API_KEY ?? '';
const BASIC_USER = env.QDRANT_BASIC_AUTH_USERNAME;
const BASIC_PASS = env.QDRANT_BASIC_AUTH_PASSWORD;
const COLLECTION = 'landesverbaende_documents';
const CURATED_LIST_ID = 'wahlprogramm-be';
const DRY_RUN = !process.argv.includes('--execute');

const URL_PAIRS: Array<{ news: string; canonical: string }> = [
  {
    news: 'https://gruene.berlin/news/unser-wahlprogramm_3762',
    canonical: 'https://gruene.berlin/beschluesse/unser-wahlprogramm_3762',
  },
  {
    news: 'https://gruene.berlin/news/unser-wahlprogramm-1_3763',
    canonical: 'https://gruene.berlin/beschluesse/unser-wahlprogramm-1_3763',
  },
  {
    news: 'https://gruene.berlin/news/unser-wahlprogramm-kapitel-2_3764',
    canonical: 'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-2_3764',
  },
  {
    news: 'https://gruene.berlin/news/unser-wahlprogramm-kapitel-3_3765',
    canonical: 'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-3_3765',
  },
  {
    news: 'https://gruene.berlin/news/unser-wahlprogramm-kapitel-4_3766',
    canonical: 'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-4_3766',
  },
  {
    news: 'https://gruene.berlin/news/unser-wahlprogramm-kapitel-5_3767',
    canonical: 'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-5_3767',
  },
  {
    news: 'https://gruene.berlin/news/unser-wahlprogramm-kapitel-6_3768',
    canonical: 'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-6_3768',
  },
];

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': QDRANT_API_KEY,
  };
  if (BASIC_USER && BASIC_PASS) {
    headers['Authorization'] =
      `Basic ${Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString('base64')}`;
  }
  return headers;
}

async function qdrantPost<T = unknown>(
  path: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const resp = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Qdrant ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<T>;
}

interface ScrollPoint {
  id: string | number;
  payload?: { document_id?: string; chunk_index?: number; curated_lists?: string[] };
}

interface ScrollResponse {
  result?: { points?: ScrollPoint[]; next_page_offset?: string | number | null };
}

async function scrollByUrl(url: string): Promise<ScrollPoint[]> {
  const points: ScrollPoint[] = [];
  let offset: string | number | null = null;

  while (true) {
    const body: Record<string, unknown> = {
      limit: 200,
      with_payload: { include: ['document_id', 'chunk_index', 'curated_lists'] },
      with_vector: false,
      filter: { must: [{ key: 'source_url', match: { value: url } }] },
    };
    if (offset !== null) body.offset = offset;

    const data = await qdrantPost<ScrollResponse>(
      `/collections/${COLLECTION}/points/scroll`,
      body
    );
    const batch = data.result?.points ?? [];
    if (batch.length === 0) break;
    points.push(...batch);
    offset = data.result?.next_page_offset ?? null;
    if (offset === null) break;
  }

  return points;
}

async function setCuratedListTag(url: string): Promise<void> {
  await qdrantPost(`/collections/${COLLECTION}/points/payload`, {
    payload: { curated_lists: [CURATED_LIST_ID] },
    filter: { must: [{ key: 'source_url', match: { value: url } }] },
  });
}

async function deleteByUrl(url: string): Promise<void> {
  await qdrantPost(`/collections/${COLLECTION}/points/delete`, {
    filter: { must: [{ key: 'source_url', match: { value: url } }] },
  });
}

interface PairResult {
  pair: { news: string; canonical: string };
  newsCount: number;
  canonicalCount: number;
  action: 'migrate' | 'news-only-skipped' | 'canonical-only-skipped' | 'neither';
}

async function main() {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    console.error('QDRANT_URL and QDRANT_API_KEY are required');
    process.exit(1);
  }

  console.log(
    `\n${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}  Migrating ${URL_PAIRS.length} BE wahlprogramm chapter pairs\n`
  );

  const results: PairResult[] = [];

  for (const pair of URL_PAIRS) {
    const [newsPoints, canonicalPoints] = await Promise.all([
      scrollByUrl(pair.news),
      scrollByUrl(pair.canonical),
    ]);

    const newsCount = newsPoints.length;
    const canonicalCount = canonicalPoints.length;

    let action: PairResult['action'];
    if (canonicalCount > 0 && newsCount > 0) action = 'migrate';
    else if (newsCount > 0) action = 'news-only-skipped';
    else if (canonicalCount > 0) action = 'canonical-only-skipped';
    else action = 'neither';

    results.push({ pair, newsCount, canonicalCount, action });

    const slug = pair.canonical.split('/').pop();
    console.log(`  ${slug}`);
    console.log(`    /news/        ${newsCount} chunks`);
    console.log(`    /beschluesse/ ${canonicalCount} chunks`);
    console.log(`    action:       ${action}`);

    if (action === 'migrate' && !DRY_RUN) {
      await setCuratedListTag(pair.canonical);
      await deleteByUrl(pair.news);
      console.log(`    applied: tagged canonical, deleted ${newsCount} news chunks`);
    }
    console.log();
  }

  const tally = {
    migrate: results.filter((r) => r.action === 'migrate').length,
    newsOnly: results.filter((r) => r.action === 'news-only-skipped').length,
    canonicalOnly: results.filter((r) => r.action === 'canonical-only-skipped').length,
    neither: results.filter((r) => r.action === 'neither').length,
  };
  const totalDeleted = results
    .filter((r) => r.action === 'migrate')
    .reduce((sum, r) => sum + r.newsCount, 0);
  const totalTagged = results
    .filter((r) => r.action === 'migrate')
    .reduce((sum, r) => sum + r.canonicalCount, 0);

  console.log('─── Summary ───────────────────────────────');
  console.log(`  pairs to migrate:        ${tally.migrate}`);
  console.log(`  /news/ only (skipped):   ${tally.newsOnly}`);
  console.log(`  canonical only (no-op):  ${tally.canonicalOnly}`);
  console.log(`  neither side present:    ${tally.neither}`);
  console.log(`  chunks to tag canonical: ${totalTagged}`);
  console.log(`  chunks to delete (news): ${totalDeleted}`);
  console.log();

  if (tally.newsOnly > 0) {
    console.log('NOTE: /news/-only entries were left untouched. Re-scrape their canonical');
    console.log('      /beschluesse/ URL via the sitemap-driven berlin-lv-beschluesse');
    console.log('      scraper, then re-run this migration to clean them up.');
    console.log();
  }

  if (DRY_RUN && tally.migrate > 0) {
    console.log('Run with --execute to apply.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
