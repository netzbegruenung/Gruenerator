#!/usr/bin/env npx tsx
/**
 * Backfill full_text Field on Qdrant Chunk-0 Points
 *
 * Reconstructs full document text from existing chunks and patches it onto
 * each document's chunk-0 point via Qdrant's setPayload API. This is a
 * non-destructive, additive operation — vectors and existing payload fields
 * are preserved.
 *
 * Usage:
 *   npx tsx scripts/backfillFullText.ts [options]
 *
 * Options:
 *   --collection NAME   Process only a specific collection (can be repeated)
 *   --dry-run           Show stats without writing to Qdrant
 *   --batch-size N      Points per setPayload call (default: 50)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_BASIC_AUTH_USERNAME = process.env.QDRANT_BASIC_AUTH_USERNAME;
const QDRANT_BASIC_AUTH_PASSWORD = process.env.QDRANT_BASIC_AUTH_PASSWORD;

const SCROLL_BATCH_SIZE = 100;

interface CollectionConfig {
  name: string;
  groupBy: string;
}

const COLLECTIONS: CollectionConfig[] = [
  { name: 'landesverbaende_documents', groupBy: 'document_id' },
  { name: 'bundestag_content', groupBy: 'source_url' },
  { name: 'gruene_de_documents', groupBy: 'source_url' },
  { name: 'grundsatz_documents', groupBy: 'document_id' },
  { name: 'oesterreich_gruene_documents', groupBy: 'source_url' },
  { name: 'gruene_at_documents', groupBy: 'source_url' },
  { name: 'kommunalwiki_documents', groupBy: 'source_url' },
  { name: 'boell_stiftung_documents', groupBy: 'source_url' },
];

// ============================================================================
// Qdrant Client
// ============================================================================

function getQdrantClient(): QdrantClient {
  if (!QDRANT_API_KEY) {
    throw new Error('QDRANT_API_KEY environment variable is required');
  }

  const headers: Record<string, string> = {};
  if (QDRANT_BASIC_AUTH_USERNAME && QDRANT_BASIC_AUTH_PASSWORD) {
    const basicAuth = Buffer.from(
      `${QDRANT_BASIC_AUTH_USERNAME}:${QDRANT_BASIC_AUTH_PASSWORD}`
    ).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
  }

  if (QDRANT_URL.startsWith('https://')) {
    const url = new URL(QDRANT_URL);
    const port = url.port ? parseInt(url.port) : 443;
    const basePath = url.pathname && url.pathname !== '/' ? url.pathname : undefined;

    return new QdrantClient({
      host: url.hostname,
      port,
      https: true,
      apiKey: QDRANT_API_KEY,
      timeout: 120000,
      checkCompatibility: false,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(basePath ? { prefix: basePath } : {}),
    });
  }

  return new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
    timeout: 120000,
    checkCompatibility: false,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });
}

// ============================================================================
// Core Logic
// ============================================================================

interface ChunkPoint {
  id: string | number;
  payload: Record<string, unknown>;
}

interface DocumentGroup {
  docKey: string;
  chunks: ChunkPoint[];
  chunk0Id: string | number;
}

async function scrollCollection(client: QdrantClient, collection: string): Promise<ChunkPoint[]> {
  const points: ChunkPoint[] = [];
  let offset: string | number | null = null;

  while (true) {
    const result = await client.scroll(collection, {
      limit: SCROLL_BATCH_SIZE,
      offset: offset ?? undefined,
      with_payload: true,
      with_vector: false,
    });

    if (!result.points || result.points.length === 0) break;

    for (const point of result.points) {
      points.push({
        id: point.id,
        payload: (point.payload || {}) as Record<string, unknown>,
      });
    }

    const nextOffset = result.next_page_offset;
    offset = typeof nextOffset === 'string' || typeof nextOffset === 'number' ? nextOffset : null;

    if (!offset) break;
    process.stdout.write(`\r  Scrolled ${points.length} chunks...`);
  }

  return points;
}

/**
 * Remove overlap between adjacent chunks.
 * smartChunkDocument uses ~400 char overlap. We find the longest suffix of
 * chunkA that matches a prefix of chunkB and skip the duplicate.
 */
function deduplicateOverlap(chunkA: string, chunkB: string): string {
  const maxOverlap = Math.min(chunkA.length, chunkB.length, 600);
  let bestOverlap = 0;

  for (let len = 20; len <= maxOverlap; len++) {
    const suffix = chunkA.slice(-len);
    if (chunkB.startsWith(suffix)) {
      bestOverlap = len;
    }
  }

  return bestOverlap > 0 ? chunkB.slice(bestOverlap) : chunkB;
}

function groupAndReconstruct(points: ChunkPoint[], config: CollectionConfig): DocumentGroup[] {
  const groups = new Map<string, ChunkPoint[]>();

  for (const point of points) {
    const key =
      (point.payload[config.groupBy] as string) ||
      (point.payload.source_url as string) ||
      String(point.id);

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(point);
  }

  const results: DocumentGroup[] = [];

  for (const [docKey, chunks] of groups) {
    chunks.sort(
      (a, b) => ((a.payload.chunk_index as number) || 0) - ((b.payload.chunk_index as number) || 0)
    );

    const chunk0 = chunks.find((c) => (c.payload.chunk_index as number) === 0);
    if (!chunk0) continue;

    // Skip if full_text already exists
    if (chunk0.payload.full_text) continue;

    // Reconstruct with overlap deduplication
    const chunkTexts = chunks.map((c) => (c.payload.chunk_text as string) || '');

    let fullText = chunkTexts[0];
    for (let i = 1; i < chunkTexts.length; i++) {
      const deduplicated = deduplicateOverlap(fullText, chunkTexts[i]);
      fullText += '\n\n' + deduplicated;
    }

    fullText = fullText.trim();
    if (!fullText) continue;

    results.push({
      docKey,
      chunks,
      chunk0Id: chunk0.id,
    });

    // Store reconstructed text on the group for later use
    (chunk0 as any)._reconstructedFullText = fullText;
  }

  return results;
}

async function patchFullText(
  client: QdrantClient,
  collection: string,
  groups: DocumentGroup[],
  batchSize: number,
  dryRun: boolean
): Promise<{ patched: number; totalChars: number }> {
  let patched = 0;
  let totalChars = 0;

  for (let i = 0; i < groups.length; i += batchSize) {
    const batch = groups.slice(i, i + batchSize);

    for (const group of batch) {
      const chunk0 = group.chunks.find((c) => (c.payload.chunk_index as number) === 0)!;
      const fullText = (chunk0 as any)._reconstructedFullText as string;

      if (!dryRun) {
        await client.setPayload(collection, {
          payload: { full_text: fullText },
          points: [group.chunk0Id],
        });
      }

      patched++;
      totalChars += fullText.length;
    }

    process.stdout.write(
      `\r  ${dryRun ? '[DRY RUN] ' : ''}Patched ${patched}/${groups.length} documents...`
    );
  }

  return { patched, totalChars };
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    dryRun: args.includes('--dry-run'),
    collections: [] as string[],
    batchSize: 50,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--collection' && args[i + 1]) {
      result.collections.push(args[++i]);
    }
    if (args[i] === '--batch-size' && args[i + 1]) {
      result.batchSize = parseInt(args[++i], 10);
    }
  }

  return result;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('Backfill full_text on Qdrant chunk-0 points\n');

  const args = parseArgs();

  const collections =
    args.collections.length > 0
      ? COLLECTIONS.filter((c) => args.collections.includes(c.name))
      : COLLECTIONS;

  if (collections.length === 0) {
    console.error('No matching collections. Available:', COLLECTIONS.map((c) => c.name).join(', '));
    process.exit(1);
  }

  console.log(`Collections: ${collections.map((c) => c.name).join(', ')}`);
  if (args.dryRun) console.log('Mode: dry-run (no writes)\n');

  const client = getQdrantClient();

  try {
    await client.getCollections();
    console.log(`Connected to Qdrant at ${QDRANT_URL}\n`);
  } catch {
    console.error(`Could not connect to Qdrant at ${QDRANT_URL}`);
    process.exit(1);
  }

  let grandTotalPatched = 0;
  let grandTotalChars = 0;
  let grandTotalSkipped = 0;

  for (const config of collections) {
    console.log(`[${config.name}]`);

    try {
      const points = await scrollCollection(client, config.name);
      console.log(`\r  Scrolled ${points.length} chunks total`);

      const groups = groupAndReconstruct(points, config);
      const skipped =
        new Set(
          points
            .filter((p) => (p.payload.chunk_index as number) === 0)
            .map(
              (p) =>
                (p.payload[config.groupBy] as string) ||
                (p.payload.source_url as string) ||
                String(p.id)
            )
        ).size - groups.length;

      if (groups.length === 0) {
        console.log(`  No documents to patch (${skipped} already have full_text)\n`);
        grandTotalSkipped += skipped;
        continue;
      }

      const { patched, totalChars } = await patchFullText(
        client,
        config.name,
        groups,
        args.batchSize,
        args.dryRun
      );

      console.log(
        `\n  Patched: ${patched} documents (${(totalChars / 1024 / 1024).toFixed(1)} MB text)`
      );
      if (skipped > 0) console.log(`  Skipped: ${skipped} (already backfilled)`);
      console.log();

      grandTotalPatched += patched;
      grandTotalChars += totalChars;
      grandTotalSkipped += skipped;
    } catch (error) {
      console.log(
        `  WARNING: Failed for ${config.name}: ${error instanceof Error ? error.message : error}\n`
      );
    }
  }

  console.log('--- Summary ---');
  console.log(`  Patched: ${grandTotalPatched} documents`);
  console.log(`  Skipped: ${grandTotalSkipped} (already had full_text)`);
  console.log(`  Total text: ${(grandTotalChars / 1024 / 1024).toFixed(1)} MB`);
  if (args.dryRun) console.log('\n  (Dry run — no changes written)');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
