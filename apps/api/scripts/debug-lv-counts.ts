/**
 * Debug: Landesverbände Vector Count Analysis
 *
 * Discovers all distinct `landesverband` values in the landesverbaende_documents
 * collection and counts vectors per value. Helps diagnose discrepancies between
 * the total collection count and the per-LV breakdown in generate-content-stats.ts.
 *
 * Usage: npx tsx apps/api/scripts/debug-lv-counts.ts
 *
 * Requires: QDRANT_URL, QDRANT_API_KEY, QDRANT_BASIC_AUTH_USERNAME, QDRANT_BASIC_AUTH_PASSWORD
 */

import * as dotenv from 'dotenv';

dotenv.config();

import { env } from '../config/env.js';

const QDRANT_URL = (env.QDRANT_URL ?? '').replace(/\/+$/, '');
const QDRANT_API_KEY = env.QDRANT_API_KEY ?? '';
const BASIC_USER = env.QDRANT_BASIC_AUTH_USERNAME;
const BASIC_PASS = env.QDRANT_BASIC_AUTH_PASSWORD;
const COLLECTION = 'landesverbaende_documents';

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

async function qdrantPost(path: string, body: Record<string, unknown> = {}): Promise<any> {
  const resp = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Qdrant ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

async function qdrantGet(path: string): Promise<any> {
  const resp = await fetch(`${QDRANT_URL}${path}`, {
    method: 'GET',
    headers: buildHeaders(),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Qdrant ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

async function getTotalCount(): Promise<number> {
  const data = await qdrantPost(`/collections/${COLLECTION}/points/count`);
  return data.result?.count ?? 0;
}

async function getFilteredCount(filter: Record<string, unknown>): Promise<number> {
  const data = await qdrantPost(`/collections/${COLLECTION}/points/count`, { filter });
  return data.result?.count ?? 0;
}

async function discoverLandesverbandValues(): Promise<string[]> {
  const values = new Set<string>();
  let offset: string | number | null = null;
  const batchSize = 100;
  let scrolled = 0;

  console.log('Scrolling collection to discover distinct landesverband values...');

  while (true) {
    const body: Record<string, unknown> = {
      limit: batchSize,
      with_payload: { include: ['landesverband'] },
      with_vector: false,
    };
    if (offset !== null) {
      body.offset = offset;
    }

    const data = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, body);
    const points = data.result?.points ?? [];

    if (points.length === 0) break;

    for (const point of points) {
      const lv = point.payload?.landesverband;
      if (lv) {
        values.add(String(lv));
      } else {
        values.add('__MISSING__');
      }
    }

    scrolled += points.length;
    offset = data.result?.next_page_offset ?? null;

    if (scrolled % 10000 === 0) {
      console.log(`  ...scrolled ${scrolled} points, found ${values.size} distinct values so far`);
    }

    if (offset === null) break;
  }

  console.log(`Scrolled ${scrolled} points total, found ${values.size} distinct values\n`);
  return [...values].sort();
}

async function main() {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    console.error('QDRANT_URL and QDRANT_API_KEY are required');
    process.exit(1);
  }

  console.log(`\nQuerying ${COLLECTION} at ${QDRANT_URL}\n`);

  // Step 1: Total count
  const total = await getTotalCount();
  console.log(`Total vectors in collection: ${total.toLocaleString()}\n`);

  // Step 2: Discover all distinct landesverband values
  const lvValues = await discoverLandesverbandValues();

  // Step 3: Count per value
  console.log('Counting vectors per landesverband value...\n');

  const results: { code: string; count: number }[] = [];

  for (const code of lvValues) {
    let count: number;
    if (code === '__MISSING__') {
      count = await getFilteredCount({
        must_not: [
          { key: 'landesverband', match: { any: lvValues.filter((v) => v !== '__MISSING__') } },
        ],
      });
    } else {
      count = await getFilteredCount({
        must: [{ key: 'landesverband', match: { value: code } }],
      });
    }
    results.push({ code, count });
  }

  // Step 4: Print results
  results.sort((a, b) => b.count - a.count);

  const codeWidth = Math.max(20, ...results.map((r) => r.code.length + 2));
  const header = `${'landesverband'.padEnd(codeWidth)} ${'count'.padStart(10)} ${'%'.padStart(7)}`;
  console.log(header);
  console.log('─'.repeat(header.length));

  let accountedFor = 0;
  for (const { code, count } of results) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    console.log(
      `${code.padEnd(codeWidth)} ${count.toLocaleString().padStart(10)} ${(pct + '%').padStart(7)}`
    );
    accountedFor += count;
  }

  console.log('─'.repeat(header.length));
  console.log(
    `${'SUM'.padEnd(codeWidth)} ${accountedFor.toLocaleString().padStart(10)} ${((accountedFor / total) * 100).toFixed(1).padStart(6)}%`
  );
  console.log(`${'TOTAL'.padEnd(codeWidth)} ${total.toLocaleString().padStart(10)}`);

  if (accountedFor !== total) {
    console.log(`\n⚠ Gap: ${(total - accountedFor).toLocaleString()} vectors unaccounted for`);
  } else {
    console.log('\n✓ All vectors accounted for');
  }

  // Step 5: Check collection info for segment count (might reveal orphaned segments)
  try {
    const info = await qdrantGet(`/collections/${COLLECTION}`);
    const collInfo = info.result;
    console.log(`\nCollection info:`);
    console.log(`  Segments: ${collInfo?.segments_count}`);
    console.log(`  Points count: ${collInfo?.points_count}`);
    console.log(`  Vectors count: ${collInfo?.vectors_count}`);
    console.log(`  Status: ${collInfo?.status}`);
  } catch {
    // not critical
  }
}

async function analyzeByYear(lvCode: string) {
  console.log(`\n\n═══ Year distribution for ${lvCode} ═══\n`);

  // Scroll BE-F vectors and collect published_at years
  const yearCounts = new Map<string, number>();
  const sourceIdCounts = new Map<string, number>();
  let offset: string | number | null = null;
  let scrolled = 0;
  let noDate = 0;

  while (true) {
    const body: Record<string, unknown> = {
      limit: 100,
      with_payload: { include: ['published_at', 'source_id', 'source_url', 'content_type'] },
      with_vector: false,
      filter: { must: [{ key: 'landesverband', match: { value: lvCode } }] },
    };
    if (offset !== null) body.offset = offset;

    const data = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, body);
    const points = data.result?.points ?? [];
    if (points.length === 0) break;

    for (const point of points) {
      const publishedAt = point.payload?.published_at;
      const sourceId = point.payload?.source_id || '__unknown__';

      sourceIdCounts.set(sourceId, (sourceIdCounts.get(sourceId) || 0) + 1);

      if (publishedAt) {
        const year = String(publishedAt).substring(0, 4);
        yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
      } else {
        noDate++;
      }
    }

    scrolled += points.length;
    offset = data.result?.next_page_offset ?? null;
    if (scrolled % 10000 === 0) console.log(`  ...scrolled ${scrolled}`);
    if (offset === null) break;
  }

  // Print year distribution
  const years = [...yearCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const yw = 8;
  console.log(`${'Year'.padEnd(yw)} ${'Count'.padStart(10)} ${'%'.padStart(7)}`);
  console.log('─'.repeat(27));
  for (const [year, count] of years) {
    const pct = ((count / scrolled) * 100).toFixed(1);
    console.log(
      `${year.padEnd(yw)} ${count.toLocaleString().padStart(10)} ${(pct + '%').padStart(7)}`
    );
  }
  if (noDate > 0) {
    console.log(
      `${'no date'.padEnd(yw)} ${noDate.toLocaleString().padStart(10)} ${((noDate / scrolled) * 100).toFixed(1).padStart(6)}%`
    );
  }
  console.log(`${'TOTAL'.padEnd(yw)} ${scrolled.toLocaleString().padStart(10)}`);

  // Print source_id distribution
  console.log(`\n${'source_id'.padEnd(40)} ${'Count'.padStart(10)} ${'%'.padStart(7)}`);
  console.log('─'.repeat(59));
  const sources = [...sourceIdCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [src, count] of sources) {
    const pct = ((count / scrolled) * 100).toFixed(1);
    console.log(
      `${src.padEnd(40)} ${count.toLocaleString().padStart(10)} ${(pct + '%').padStart(7)}`
    );
  }
}

// Run year analysis if --analyze flag or always for the top LV
const targetLv = process.argv[2] || 'BE-F';

analyzeByYear(targetLv).catch((err) => {
  console.error('Year analysis error:', err);
});

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
