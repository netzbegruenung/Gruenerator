#!/usr/bin/env tsx
/**
 * Metadata-only date backfill — for each Qdrant point with NULL or
 * malformatted `published_at`, fetches the article URL, extracts the date
 * with current contentSelectors + normalizeGermanDate, and PATCHes the
 * `published_at` payload field on Qdrant. NO embedding, NO vector replacement.
 *
 * Usage:
 *   npx tsx patch-dates.ts <source-id> [--dry-run]
 *
 * Examples:
 *   npx tsx patch-dates.ts hamburg-lv-presse
 *   npx tsx patch-dates.ts sachsen-anhalt-fraktion
 *   npx tsx patch-dates.ts brandenburg-archive-presse  # also re-normalizes existing DD.MM.YYYY
 *
 * Order of magnitude faster than --force re-scrape:
 *   - sachsen-anhalt-fraktion 743 articles: ~5 min (vs ~25 min --force, and --force only
 *     covers articles on the listing, missing 695 of them)
 *   - hamburg-lv-presse 1948 articles: ~10 min (vs ~1.5h --force)
 */

import * as cheerio from 'cheerio';

import { getSourceById } from './config/landesverbaendeConfig.js';
import { getQdrantInstance } from './database/services/QdrantService/index.js';
import { ContentExtractor } from './services/scrapers/implementations/LandesverbandScraper/extractors/ContentExtractor.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceId = args.find((a) => !a.startsWith('--'));

if (!sourceId) {
  console.error('Usage: patch-dates.ts <source-id> [--dry-run]');
  process.exit(1);
}

const source = getSourceById(sourceId);
if (!source) {
  console.error(`Unknown source: ${sourceId}`);
  process.exit(1);
}

const COLLECTION = source.qdrantCollection || 'landesverbaende_documents';
const UA = 'Gruenerator-Bot/1.0 (+https://gruenerator.eu)';

interface QdrantPoint {
  id: string | number;
  payload?: { source_url?: string; published_at?: string | null; chunk_index?: number };
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function extractDate(html: string): string | null {
  const $ = cheerio.load(html);
  for (const sel of source!.contentSelectors.date) {
    const el = $(sel).first();
    if (!el.length) continue;
    let raw = el.attr('datetime') || el.attr('content') || el.text().trim();
    if (!raw) continue;
    raw = ContentExtractor.normalizeGermanDate(raw);
    if (raw) return raw;
  }
  return null;
}

async function main(): Promise<void> {
  console.log(`\n[patch-dates] source=${sourceId} collection=${COLLECTION} dry-run=${dryRun}`);

  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client!;

  // Scroll all chunk_index=0 points for this source (one per article).
  // Note: tsconfig has `exactOptionalPropertyTypes`, so we spread `offset` only
  // when defined rather than passing `offset: undefined`.
  const points: QdrantPoint[] = [];
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;
  do {
    const res = await client.scroll(COLLECTION, {
      filter: {
        must: [
          { key: 'source_id', match: { value: sourceId } },
          { key: 'chunk_index', match: { value: 0 } },
        ],
      },
      limit: 200,
      with_payload: ['source_url', 'published_at'],
      with_vector: false,
      ...(offset !== undefined && offset !== null ? { offset } : {}),
    });
    points.push(...(res.points as QdrantPoint[]));
    offset = res.next_page_offset;
  } while (offset !== null && offset !== undefined);

  console.log(`Fetched ${points.length} articles from Qdrant`);

  // Filter: only articles where published_at is missing OR not in ISO format
  const isISO = (s: string | null | undefined): boolean => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);
  const candidates = points.filter((p) => !isISO(p.payload?.published_at));
  console.log(`Candidates needing date patch: ${candidates.length}`);

  if (dryRun) {
    console.log('\n[dry-run] sample 5:');
    for (const p of candidates.slice(0, 5)) {
      console.log(`  pub=${p.payload?.published_at ?? 'NULL'} url=${p.payload?.source_url}`);
    }
    process.exit(0);
  }

  let patched = 0;
  let no_html = 0;
  let no_date = 0;
  const already = 0;

  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    const url = p.payload?.source_url;
    if (!url) continue;

    const existing = p.payload?.published_at;

    // For sources with stored DD.MM.YYYY (brandenburg-archive), try renormalizing
    // FIRST without re-fetching — saves an HTTP call per article.
    if (existing && /\d{1,2}\.\d{1,2}\.\d{2,4}/.test(existing)) {
      const norm = ContentExtractor.normalizeGermanDate(existing);
      if (isISO(norm)) {
        await client.setPayload(COLLECTION, {
          payload: { published_at: norm },
          filter: {
            must: [
              { key: 'source_id', match: { value: sourceId } },
              { key: 'source_url', match: { value: url } },
            ],
          },
        });
        patched++;
        if (i % 20 === 0 || i === candidates.length - 1)
          console.log(`  [${i + 1}/${candidates.length}] renorm: ${existing} → ${norm}`);
        continue;
      }
    }

    // NULL or non-ISO and not renormalizable → fetch the article
    const html = await fetchPage(url);
    if (!html) {
      no_html++;
      continue;
    }
    const date = extractDate(html);
    if (!date || !isISO(date)) {
      no_date++;
      continue;
    }

    // Patch all chunks for this article (set_payload with filter)
    await client.setPayload(COLLECTION, {
      payload: { published_at: date },
      filter: {
        must: [
          { key: 'source_id', match: { value: sourceId } },
          { key: 'source_url', match: { value: url } },
        ],
      },
    });
    patched++;
    if (i % 20 === 0 || i === candidates.length - 1)
      console.log(`  [${i + 1}/${candidates.length}] ${date} ← ${url.slice(-60)}`);
  }

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`  patched:   ${patched}`);
  console.log(`  no_html:   ${no_html} (article fetch failed)`);
  console.log(`  no_date:   ${no_date} (selector still didn't match)`);
  console.log(`  already:   ${already}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
