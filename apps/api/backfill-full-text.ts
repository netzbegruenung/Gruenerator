/**
 * Backfill full_text on chunk_index=0 points
 *
 * For each collection that now stores full_text on new scrapes,
 * this script finds existing points missing the field, reconstructs
 * the full text from sibling chunks, and patches it via setPayload.
 *
 * Safe & idempotent: only adds full_text where missing, no deletions,
 * no re-embedding, no external HTTP requests.
 *
 * Run: npx tsx apps/api/backfill-full-text.ts [--collection <name>] [--dry-run]
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';

dotenv.config();

// Collections that now write full_text on index but have existing data without it
const TARGET_COLLECTIONS = [
  'bundestag_content',
  'gruene_de_documents',
  'gruene_at_documents',
  'kommunalwiki_documents',
  'boell_stiftung_documents',
  'landesverbaende_documents',
];

const SCROLL_BATCH = 100;
const SIBLING_LIMIT = 200; // max chunks per document

interface BackfillStats {
  collection: string;
  scanned: number;
  alreadyHasFullText: number;
  patched: number;
  errors: number;
  singleChunkSkipped: number;
}

function createQdrantClient(): QdrantClient {
  const apiKey = process.env.QDRANT_API_KEY;
  const qdrantUrl = process.env.QDRANT_URL;

  if (!apiKey || !qdrantUrl) {
    throw new Error('QDRANT_API_KEY and QDRANT_URL env vars required');
  }

  // Basic auth for reverse proxy (same as QdrantService.ts)
  const basicAuthUsername = process.env.QDRANT_BASIC_AUTH_USERNAME;
  const basicAuthPassword = process.env.QDRANT_BASIC_AUTH_PASSWORD;
  const headers: Record<string, string> = {};

  if (basicAuthUsername && basicAuthPassword) {
    const basicAuth = Buffer.from(`${basicAuthUsername}:${basicAuthPassword}`).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
  }

  if (qdrantUrl.startsWith('https://')) {
    const url = new URL(qdrantUrl);
    const port = url.port ? parseInt(url.port) : 443;
    const basePath = url.pathname && url.pathname !== '/' ? url.pathname : undefined;

    return new QdrantClient({
      host: url.hostname,
      port,
      https: true,
      apiKey,
      timeout: 60000,
      checkCompatibility: false,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(basePath ? { prefix: basePath } : {}),
    });
  }

  return new QdrantClient({
    url: qdrantUrl,
    apiKey,
    https: false,
    timeout: 60000,
    checkCompatibility: false,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });
}

async function backfillCollection(
  client: QdrantClient,
  collection: string,
  dryRun: boolean
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    collection,
    scanned: 0,
    alreadyHasFullText: 0,
    patched: 0,
    errors: 0,
    singleChunkSkipped: 0,
  };

  console.log(`\n--- ${collection} ---`);

  // Check collection exists
  try {
    await client.getCollection(collection);
  } catch {
    console.log(`  Collection does not exist, skipping.`);
    return stats;
  }

  let offset: string | number | null = null;
  let hasMore = true;

  while (hasMore) {
    // Scroll chunk_index=0 points
    const scrollParams: Record<string, unknown> = {
      filter: {
        must: [{ key: 'chunk_index', match: { value: 0 } }],
      },
      limit: SCROLL_BATCH,
      with_payload: ['source_url', 'full_text', 'chunk_text'],
      with_vector: false,
    };
    if (offset !== null) {
      scrollParams.offset = offset;
    }

    const result = await client.scroll(collection, scrollParams);
    const points = result.points || [];

    if (points.length === 0) {
      break;
    }

    for (const point of points) {
      stats.scanned++;
      const payload = point.payload as Record<string, unknown>;

      // Already has full_text
      if (
        payload.full_text &&
        typeof payload.full_text === 'string' &&
        payload.full_text.length > 0
      ) {
        stats.alreadyHasFullText++;
        continue;
      }

      const sourceUrl = payload.source_url as string;
      if (!sourceUrl) {
        stats.errors++;
        continue;
      }

      try {
        // Fetch all sibling chunks for this URL
        const siblings = await client.scroll(collection, {
          filter: {
            must: [{ key: 'source_url', match: { value: sourceUrl } }],
          },
          limit: SIBLING_LIMIT,
          with_payload: ['chunk_index', 'chunk_text'],
          with_vector: false,
        });

        const siblingPoints = siblings.points || [];

        if (siblingPoints.length <= 1) {
          // Single chunk — use its own chunk_text as full_text
          const text = payload.chunk_text as string;
          if (!text) {
            stats.singleChunkSkipped++;
            continue;
          }

          if (!dryRun) {
            await client.setPayload(collection, {
              payload: { full_text: text },
              points: [point.id],
            });
          }
          stats.patched++;
          continue;
        }

        // Sort by chunk_index and concatenate
        const sorted = siblingPoints
          .map((p) => ({
            index: (p.payload as Record<string, unknown>).chunk_index as number,
            text: (p.payload as Record<string, unknown>).chunk_text as string,
          }))
          .filter((c) => typeof c.text === 'string' && c.text.length > 0)
          .sort((a, b) => a.index - b.index);

        const fullText = sorted.map((c) => c.text).join('\n\n');

        if (fullText.length === 0) {
          stats.errors++;
          continue;
        }

        if (!dryRun) {
          await client.setPayload(collection, {
            payload: { full_text: fullText },
            points: [point.id],
          });
        }

        stats.patched++;

        if (stats.patched % 50 === 0) {
          console.log(`  Progress: ${stats.patched} patched, ${stats.scanned} scanned...`);
        }
      } catch (err) {
        stats.errors++;
        console.error(`  Error processing ${sourceUrl}:`, err instanceof Error ? err.message : err);
      }
    }

    // Use next_page_offset for pagination
    offset = result.next_page_offset ?? null;
    if (offset === null || offset === undefined) {
      hasMore = false;
    }
  }

  return stats;
}

function parseArgs(): { collection?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const result: { collection?: string; dryRun: boolean } = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--collection') result.collection = args[++i];
    if (args[i] === '--dry-run') result.dryRun = true;
  }

  return result;
}

async function main() {
  const { collection, dryRun } = parseArgs();

  console.log('=== Backfill full_text on chunk_index=0 ===');
  if (dryRun) console.log('DRY RUN — no writes will be made');

  const client = createQdrantClient();
  const collections = collection ? [collection] : TARGET_COLLECTIONS;
  const allStats: BackfillStats[] = [];

  for (const col of collections) {
    const stats = await backfillCollection(client, col, dryRun);
    allStats.push(stats);

    console.log(
      `  Done: ${stats.patched} patched, ${stats.alreadyHasFullText} already had full_text, ${stats.singleChunkSkipped} single-chunk, ${stats.errors} errors (of ${stats.scanned} scanned)`
    );
  }

  console.log('\n=== SUMMARY ===');
  let totalPatched = 0;
  let totalScanned = 0;
  for (const s of allStats) {
    totalPatched += s.patched;
    totalScanned += s.scanned;
    console.log(`  ${s.collection}: ${s.patched}/${s.scanned} patched`);
  }
  console.log(`  TOTAL: ${totalPatched}/${totalScanned} patched`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
