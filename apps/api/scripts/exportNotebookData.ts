#!/usr/bin/env npx tsx
/**
 * Qdrant Document Export Script
 *
 * Exports all party documents from Qdrant collections, reconstructs full
 * documents from chunks, and outputs raw JSONL for fine-tuning pipelines.
 *
 * Usage:
 *   npx tsx scripts/exportNotebookData.ts [options]
 *
 * Options:
 *   --collection NAME   Export only a specific collection (can be repeated)
 *   --dry-run           Show collection stats without exporting
 *   --output FILE       Output file path (default: data/raw-documents.jsonl)
 *   --limit N           Max documents per collection (default: all)
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
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

/**
 * Collections to export with their document grouping strategy.
 * - groupBy: which payload field uniquely identifies a document across its chunks
 * - hasChunks: whether documents are split into chunks that need reconstruction
 */
const EXPORT_COLLECTIONS: CollectionConfig[] = [
  {
    name: 'landesverbaende_documents',
    groupBy: 'document_id',
    hasChunks: true,
    description: 'Landesverbände: Pressemitteilungen, Beschlüsse, Anträge',
  },
  {
    name: 'bundestag_content',
    groupBy: 'source_url',
    hasChunks: true,
    description: 'Bundestagsfraktion: Fachtexte, Positionen',
  },
  {
    name: 'gruene_de_documents',
    groupBy: 'source_url',
    hasChunks: true,
    description: 'gruene.de: Positionen, Themen, Aktuelles',
  },
  {
    name: 'grundsatz_documents',
    groupBy: 'document_id',
    hasChunks: true,
    description: 'Grundsatzprogramm, Wahlprogramme',
  },
  {
    name: 'oesterreich_gruene_documents',
    groupBy: 'source_url',
    hasChunks: true,
    description: 'Austrian Green party programs',
  },
  {
    name: 'gruene_at_documents',
    groupBy: 'source_url',
    hasChunks: true,
    description: 'Austrian Green web content',
  },
  {
    name: 'kommunalwiki_documents',
    groupBy: 'source_url',
    hasChunks: true,
    description: 'Kommunalpolitik wiki articles',
  },
  {
    name: 'boell_stiftung_documents',
    groupBy: 'source_url',
    hasChunks: true,
    description: 'Heinrich-Böll-Stiftung: Analysen, Dossiers',
  },
  {
    name: 'social_media_examples',
    groupBy: 'id',
    hasChunks: false,
    description: 'Facebook/Instagram posts (atomic, no chunk reconstruction)',
  },
];

// ============================================================================
// Types
// ============================================================================

interface CollectionConfig {
  name: string;
  groupBy: string;
  hasChunks: boolean;
  description: string;
}

interface RawDocument {
  collection: string;
  document_id: string;
  title: string | null;
  content: string;
  content_type: string | null;
  primary_category: string | null;
  subcategories: string[];
  source_url: string | null;
  published_at: string | null;
  landesverband: string | null;
  country: string | null;
  platform: string | null;
  chunk_count: number;
}

interface CollectionStats {
  collection: string;
  totalPoints: number;
  reconstructedDocuments: number;
  avgChunksPerDoc: number;
  contentTypes: Record<string, number>;
}

// ============================================================================
// Qdrant Client (mirrors existing pattern from exportFineTuningData.ts)
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
// Scroll & Reconstruct
// ============================================================================

interface ChunkPoint {
  id: string | number;
  payload: Record<string, unknown>;
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

function reconstructDocuments(points: ChunkPoint[], config: CollectionConfig): RawDocument[] {
  if (!config.hasChunks) {
    // Atomic documents (social media) — each point is a complete document
    return points
      .map((point) => {
        const p = point.payload;
        const content =
          (p.content as string) ||
          (p.text as string) ||
          ((p.content_data as Record<string, unknown>)?.content as string) ||
          ((p.content_data as Record<string, unknown>)?.caption as string) ||
          '';

        return {
          collection: config.name,
          document_id: (p.example_id as string) || String(point.id),
          title: (p.title as string) || null,
          content: content.trim(),
          content_type: (p.type as string) || (p.platform as string) || null,
          primary_category: (p.primary_category as string) || null,
          subcategories: (p.categories as string[]) || [],
          source_url: (p.source_url as string) || null,
          published_at: (p.published_at as string) || null,
          landesverband: null,
          country: (p.country as string) || null,
          platform: (p.platform as string) || null,
          chunk_count: 1,
        };
      })
      .filter((doc) => doc.content.length > 0);
  }

  // Group chunks by document identifier
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

  const documents: RawDocument[] = [];

  for (const [docId, chunks] of groups) {
    // Sort by chunk_index for correct text order
    chunks.sort(
      (a, b) => ((a.payload.chunk_index as number) || 0) - ((b.payload.chunk_index as number) || 0)
    );

    // Use metadata from first chunk (most complete)
    const meta = chunks[0].payload;

    // Prefer full_text from chunk-0 (set by backfill or scraper) over reconstruction
    const fullText =
      (meta.full_text as string) ||
      chunks.map((c) => (c.payload.chunk_text as string) || '').join('\n\n');

    if (!fullText.trim()) continue;

    documents.push({
      collection: config.name,
      document_id: docId,
      title: (meta.title as string) || null,
      content: fullText.trim(),
      content_type: (meta.content_type as string) || (meta.document_type as string) || null,
      primary_category: (meta.primary_category as string) || null,
      subcategories: (meta.subcategories as string[]) || [],
      source_url: (meta.source_url as string) || null,
      published_at: (meta.published_at as string) || null,
      landesverband: (meta.landesverband as string) || null,
      country: (meta.country as string) || null,
      platform: null,
      chunk_count: chunks.length,
    });
  }

  return documents;
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    dryRun: args.includes('--dry-run'),
    collections: [] as string[],
    output: 'data/raw-documents.jsonl',
    limit: undefined as number | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--collection' && args[i + 1]) {
      result.collections.push(args[++i]);
    }
    if (args[i] === '--output' && args[i + 1]) {
      result.output = args[++i];
    }
    if (args[i] === '--limit' && args[i + 1]) {
      result.limit = parseInt(args[++i], 10);
    }
  }

  return result;
}

function printCollectionStats(allStats: CollectionStats[]): void {
  let totalDocs = 0;
  let totalPoints = 0;

  console.log('\n--- Export Statistics ---\n');

  for (const stats of allStats) {
    console.log(`  ${stats.collection}:`);
    console.log(`    Points: ${stats.totalPoints}`);
    console.log(
      `    Documents: ${stats.reconstructedDocuments} (avg ${stats.avgChunksPerDoc.toFixed(1)} chunks/doc)`
    );

    if (Object.keys(stats.contentTypes).length > 0) {
      console.log(`    Content types:`);
      for (const [type, count] of Object.entries(stats.contentTypes).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${type}: ${count}`);
      }
    }
    console.log();

    totalDocs += stats.reconstructedDocuments;
    totalPoints += stats.totalPoints;
  }

  console.log(`  Total: ${totalDocs} documents from ${totalPoints} chunks\n`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('Qdrant Document Export\n');

  const args = parseArgs();
  const outputPath = resolve(args.output);

  // Filter collections if specified
  const collections =
    args.collections.length > 0
      ? EXPORT_COLLECTIONS.filter((c) => args.collections.includes(c.name))
      : EXPORT_COLLECTIONS;

  if (collections.length === 0) {
    console.error(
      'No matching collections found. Available:',
      EXPORT_COLLECTIONS.map((c) => c.name).join(', ')
    );
    process.exit(1);
  }

  console.log(`Collections: ${collections.map((c) => c.name).join(', ')}`);
  console.log(`Output: ${outputPath}`);
  if (args.limit) console.log(`Limit: ${args.limit} documents per collection`);
  if (args.dryRun) console.log('Mode: dry-run (stats only)\n');

  const client = getQdrantClient();

  try {
    await client.getCollections();
    console.log(`Connected to Qdrant at ${QDRANT_URL}\n`);
  } catch {
    console.error(`Could not connect to Qdrant at ${QDRANT_URL}`);
    process.exit(1);
  }

  const allStats: CollectionStats[] = [];
  const allDocuments: RawDocument[] = [];

  for (const config of collections) {
    console.log(`[${config.name}] ${config.description}`);

    try {
      const points = await scrollCollection(client, config.name);
      console.log(`\r  Scrolled ${points.length} chunks total`);

      let documents = reconstructDocuments(points, config);

      if (args.limit && documents.length > args.limit) {
        documents = documents.slice(0, args.limit);
      }

      // Collect stats
      const contentTypes: Record<string, number> = {};
      for (const doc of documents) {
        const ct = doc.content_type || 'unknown';
        contentTypes[ct] = (contentTypes[ct] || 0) + 1;
      }

      allStats.push({
        collection: config.name,
        totalPoints: points.length,
        reconstructedDocuments: documents.length,
        avgChunksPerDoc: documents.length > 0 ? points.length / documents.length : 0,
        contentTypes,
      });

      allDocuments.push(...documents);
      console.log(`  Reconstructed ${documents.length} documents\n`);
    } catch (error) {
      console.log(
        `  WARNING: Could not export ${config.name}: ${error instanceof Error ? error.message : error}\n`
      );
    }
  }

  printCollectionStats(allStats);

  if (args.dryRun) {
    console.log('Dry run complete. Run without --dry-run to export.');
    return;
  }

  // Write output
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const lines = allDocuments.map((doc) => JSON.stringify(doc));
  writeFileSync(outputPath, lines.join('\n') + '\n');

  console.log(`Wrote ${allDocuments.length} documents to ${outputPath}`);
  console.log(`File size: ${(Buffer.byteLength(lines.join('\n')) / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
