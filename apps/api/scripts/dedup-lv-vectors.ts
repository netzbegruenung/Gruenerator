/**
 * Deduplicate landesverbaende_documents vectors
 *
 * Finds vectors with duplicate base URLs (same path, different ?tmstv= params),
 * keeps the newest version (by indexed_at), deletes the rest.
 *
 * Usage:
 *   npx tsx apps/api/scripts/dedup-lv-vectors.ts              # dry run (default)
 *   npx tsx apps/api/scripts/dedup-lv-vectors.ts --execute     # actually delete
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
const DRY_RUN = !process.argv.includes('--execute');

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
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Qdrant ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

function stripCacheBusting(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('tmstv');
    const search = parsed.searchParams.toString();
    return parsed.origin + parsed.pathname + (search ? '?' + search : '');
  } catch {
    return url.split('?')[0];
  }
}

interface VectorInfo {
  id: string | number;
  sourceUrl: string;
  indexedAt: string;
  chunkIndex: number;
}

async function main() {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    console.error('QDRANT_URL and QDRANT_API_KEY are required');
    process.exit(1);
  }

  console.log(`\n${DRY_RUN ? '🔍 DRY RUN' : '🗑️  EXECUTE MODE'} — Deduplicating ${COLLECTION}\n`);

  // Step 1: Scroll all BE-F beschluesse vectors (the problematic source)
  console.log('Scrolling BE-F berlin-fraktion-beschluesse vectors...');

  const vectorsByBaseUrl = new Map<string, VectorInfo[]>();
  let offset: string | number | null = null;
  let scrolled = 0;

  while (true) {
    const body: Record<string, unknown> = {
      limit: 100,
      with_payload: { include: ['source_url', 'indexed_at', 'chunk_index'] },
      with_vector: false,
      filter: {
        must: [
          { key: 'landesverband', match: { value: 'BE-F' } },
          { key: 'source_id', match: { value: 'berlin-fraktion-beschluesse' } },
        ],
      },
    };
    if (offset !== null) body.offset = offset;

    const data = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, body);
    const points = data.result?.points ?? [];
    if (points.length === 0) break;

    for (const point of points) {
      const sourceUrl = (point.payload?.source_url as string) || '';
      const baseUrl = stripCacheBusting(sourceUrl);

      if (!vectorsByBaseUrl.has(baseUrl)) vectorsByBaseUrl.set(baseUrl, []);
      vectorsByBaseUrl.get(baseUrl)!.push({
        id: point.id,
        sourceUrl,
        indexedAt: (point.payload?.indexed_at as string) || '',
        chunkIndex: (point.payload?.chunk_index as number) ?? 0,
      });
    }

    scrolled += points.length;
    offset = data.result?.next_page_offset ?? null;
    if (scrolled % 20000 === 0) console.log(`  ...scrolled ${scrolled}`);
    if (offset === null) break;
  }

  console.log(`Scrolled ${scrolled} vectors, ${vectorsByBaseUrl.size} distinct base URLs\n`);

  // Step 2: For each base URL, find all distinct indexed_at timestamps (representing scrape runs)
  // Keep the newest run's vectors, mark the rest for deletion
  let toDelete: (string | number)[] = [];
  let toKeep = 0;

  for (const [, vectors] of vectorsByBaseUrl) {
    // Group by indexed_at (each scrape run produces vectors with the same timestamp)
    const byTimestamp = new Map<string, VectorInfo[]>();
    for (const v of vectors) {
      const ts = v.indexedAt.substring(0, 19); // group by second precision
      if (!byTimestamp.has(ts)) byTimestamp.set(ts, []);
      byTimestamp.get(ts)!.push(v);
    }

    if (byTimestamp.size <= 1) {
      toKeep += vectors.length;
      continue;
    }

    // Sort timestamps descending, keep newest
    const sortedTimestamps = [...byTimestamp.keys()].sort().reverse();
    const newestTs = sortedTimestamps[0];

    for (const [ts, tsVectors] of byTimestamp) {
      if (ts === newestTs) {
        toKeep += tsVectors.length;
      } else {
        toDelete.push(...tsVectors.map((v) => v.id));
      }
    }
  }

  console.log(`Vectors to keep:   ${toKeep.toLocaleString()}`);
  console.log(`Vectors to delete: ${toDelete.length.toLocaleString()}`);
  console.log(`Total:             ${scrolled.toLocaleString()}\n`);

  if (toDelete.length === 0) {
    console.log('Nothing to delete!');
    return;
  }

  if (DRY_RUN) {
    console.log('Run with --execute to actually delete the duplicate vectors.');
    return;
  }

  // Step 3: Delete in batches
  const BATCH_SIZE = 500;
  let deleted = 0;

  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = toDelete.slice(i, i + BATCH_SIZE);
    await qdrantPost(`/collections/${COLLECTION}/points/delete`, {
      points: batch,
    });
    deleted += batch.length;
    if (deleted % 5000 === 0 || deleted === toDelete.length) {
      console.log(`  Deleted ${deleted.toLocaleString()} / ${toDelete.length.toLocaleString()}`);
    }
  }

  console.log(`\nDone! Deleted ${deleted.toLocaleString()} duplicate vectors.`);
  console.log('Note: Remaining vectors still have ?tmstv in source_url.');
  console.log('The next scrape cycle will naturally replace them with clean URLs.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
