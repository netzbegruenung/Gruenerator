/**
 * BM25 sparse-vector migration for existing Qdrant collections.
 *
 * Qdrant can only declare sparse vectors at createCollection time —
 * updateCollection rejects new vector names. Existing collections therefore
 * get the sparse vector via a copy migration:
 *
 *   1. copy-out: create `<name>__bm25_tmp` (same dense params + bm25 sparse),
 *      stream all points over, attaching BM25 vectors from payload.chunk_text
 *   2. verify counts, delete the source
 *   3. recreate the source with the full new config (dense + sparse + payload
 *      indexes from COLLECTION_SCHEMAS)
 *   4. copy-back, verify counts, delete the tmp collection
 *
 * The tmp collection always holds a full copy before the source is deleted;
 * if the script dies mid-run, rerunning resumes from the tmp copy.
 * Collections that already declare `bm25` are backfilled in place
 * (updateVectors, no re-embedding, no copy).
 *
 * Usage (from apps/api):
 *   npx tsx scripts/migrate-bm25-sparse.ts --collection grundsatz_documents
 *   npx tsx scripts/migrate-bm25-sparse.ts --all [--dry-run]
 *
 * NOTE: dotenv must run before any app import (config/env.js parses the
 * environment at import time) — hence the dynamic imports below.
 */
import dotenv from 'dotenv';

dotenv.config();

const { env } = await import('../config/env.js');
const { BM25_SPARSE_VECTOR_NAME, COLLECTION_SCHEMAS, getCollectionConfig, INDEX_TYPES } =
  await import('../config/qdrantCollectionsSchema.js');
const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');
const { encodeBm25Document } = await import('../services/text/bm25.js');

import type { QdrantClient } from '@qdrant/js-client-rest';

const TMP_SUFFIX = '__bm25_tmp';
const SCROLL_BATCH = 64;
// Points travel with their dense vector AND the full payload (chunk text), so a
// 64-point upsert is ~1 MB — above the reverse proxy's body limit in front of
// Qdrant (413 "Request Entity Too Large" on kommunalwiki_documents, 02.09.2026).
// Scrolling stays at 64; only the write is split.
const UPSERT_BATCH = 16;
const BACKFILL_SCROLL_BATCH = 256;

interface CliArgs {
  collection: string | null;
  all: boolean;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { collection: null, all: false, dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--collection':
        args.collection = argv[++i];
        break;
      case '--all':
        args.all = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        process.exit(1);
    }
  }
  if (!args.collection && !args.all) {
    console.error('Usage: migrate-bm25-sparse.ts --collection <name> | --all [--dry-run]');
    process.exit(1);
  }
  return args;
}

async function pointCount(client: QdrantClient, collection: string): Promise<number> {
  const res = await client.count(collection, { exact: true });
  return res.count;
}

function sparseFor(payload: Record<string, unknown> | null | undefined) {
  const chunkText = payload?.chunk_text;
  if (typeof chunkText !== 'string' || chunkText.length === 0) return null;
  const sparse = encodeBm25Document(chunkText);
  return sparse.indices.length > 0 ? sparse : null;
}

/** Normalize a scrolled vector into named form and attach the bm25 vector. */
function toNamedVectorWithBm25(
  vector: unknown,
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const named: Record<string, unknown> = Array.isArray(vector)
    ? { '': vector }
    : { ...(vector as Record<string, unknown>) };
  const sparse = sparseFor(payload);
  if (sparse) {
    named[BM25_SPARSE_VECTOR_NAME] = sparse;
  } else {
    delete named[BM25_SPARSE_VECTOR_NAME];
  }
  return named;
}

/** Stream all points from src to dst, attaching bm25 vectors. Returns count. */
async function copyPoints(client: QdrantClient, src: string, dst: string): Promise<number> {
  let offset: string | number | undefined | null = undefined;
  let copied = 0;

  for (;;) {
    const page = await client.scroll(src, {
      limit: SCROLL_BATCH,
      with_payload: true,
      with_vector: true,
      ...(offset != null && { offset }),
    });

    if (page.points.length > 0) {
      const points = page.points.map((p) => ({
        id: p.id,
        vector: toNamedVectorWithBm25(p.vector, p.payload as Record<string, unknown>),
        payload: p.payload || {},
      }));
      for (let i = 0; i < points.length; i += UPSERT_BATCH) {
        const slice = points.slice(i, i + UPSERT_BATCH);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.upsert(dst, { wait: true, points: slice as any });
      }
      copied += points.length;
      if (copied % 1024 < SCROLL_BATCH) {
        console.log(`  ${src} → ${dst}: ${copied} points copied`);
      }
    }

    offset = page.next_page_offset as string | number | null;
    if (offset == null) break;
  }

  return copied;
}

async function getDenseParams(
  client: QdrantClient,
  collection: string
): Promise<{ size: number; distance: string }> {
  const info = await client.getCollection(collection);
  const vectors = info.config.params.vectors as
    { size?: number; distance?: string } | Record<string, { size?: number; distance?: string }>;
  const params = typeof vectors?.size === 'number' ? vectors : (vectors as never)[''];
  if (!params || typeof (params as { size?: number }).size !== 'number') {
    throw new Error(`Cannot determine dense vector params for ${collection}`);
  }
  return params as { size: number; distance: string };
}

async function createWithSparse(
  client: QdrantClient,
  name: string,
  schemaKey: string | null,
  dense: { size: number; distance: string }
): Promise<void> {
  const schema = schemaKey ? COLLECTION_SCHEMAS[schemaKey] : null;
  if (schema) {
    const config = getCollectionConfig(dense.size, schema);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.createCollection(name, config as any);
    for (const index of schema.indexes || []) {
      try {
        await client.createPayloadIndex(name, {
          field_name: index.field,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          field_schema: INDEX_TYPES[index.type] as any,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already exists')) {
          console.warn(`  index ${index.field} on ${name} failed: ${message}`);
        }
      }
    }
  } else {
    await client.createCollection(name, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vectors: { size: dense.size, distance: dense.distance as any },
      sparse_vectors: { [BM25_SPARSE_VECTOR_NAME]: { modifier: 'idf' } },
    });
  }
}

async function hasBm25(client: QdrantClient, collection: string): Promise<boolean> {
  const info = await client.getCollection(collection);
  const sparse = (info.config.params as Record<string, unknown>)['sparse_vectors'] as
    Record<string, unknown> | undefined;
  return Boolean(sparse?.[BM25_SPARSE_VECTOR_NAME]);
}

/** In-place backfill for collections that already declare the sparse vector. */
async function backfill(client: QdrantClient, collection: string, dryRun: boolean): Promise<void> {
  let offset: string | number | undefined | null = undefined;
  let updated = 0;
  let skipped = 0;

  for (;;) {
    const page = await client.scroll(collection, {
      limit: BACKFILL_SCROLL_BATCH,
      with_payload: true,
      with_vector: false,
      ...(offset != null && { offset }),
    });

    const updates: Array<{ id: string | number; vector: Record<string, unknown> }> = [];
    for (const p of page.points) {
      const sparse = sparseFor(p.payload as Record<string, unknown>);
      if (sparse) {
        updates.push({ id: p.id, vector: { [BM25_SPARSE_VECTOR_NAME]: sparse } });
      } else {
        skipped++;
      }
    }

    if (updates.length > 0 && !dryRun) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.updateVectors(collection, { points: updates as any });
    }
    updated += updates.length;
    if (updated % 2048 < BACKFILL_SCROLL_BATCH && updated > 0) {
      console.log(`  ${collection}: ${updated} points backfilled`);
    }

    offset = page.next_page_offset as string | number | null;
    if (offset == null) break;
  }

  console.log(
    `[backfill] ${collection}: ${updated} updated, ${skipped} without chunk_text${dryRun ? ' (dry-run, nothing written)' : ''}`
  );
}

async function migrate(client: QdrantClient, collection: string, dryRun: boolean): Promise<void> {
  const tmp = `${collection}${TMP_SUFFIX}`;
  const existing = new Set((await client.getCollections()).collections.map((c) => c.name));
  const schemaKey =
    Object.keys(COLLECTION_SCHEMAS).find((k) => COLLECTION_SCHEMAS[k].name === collection) || null;

  if (!existing.has(collection) && !existing.has(tmp)) {
    console.log(`[skip] ${collection}: does not exist`);
    return;
  }

  if (existing.has(collection) && (await hasBm25(client, collection))) {
    if (existing.has(tmp)) {
      // Crash window: the source was already recreated with the sparse config
      // but the copy-back may be incomplete (the tmp copy is only deleted
      // after a verified copy-back). Resume the copy-back instead of treating
      // the partially-filled source as migrated — otherwise points are
      // silently dropped.
      if (dryRun) {
        console.log(`[dry-run] ${collection}: would resume copy-back from ${tmp}`);
        return;
      }
      console.log(`[resume] ${collection}: tmp copy still present — resuming copy-back`);
      const restored = await copyPoints(client, tmp, collection);
      const tmpCount = await pointCount(client, tmp);
      const finalCount = await pointCount(client, collection);
      if (finalCount !== tmpCount) {
        throw new Error(
          `${collection}: count mismatch after resumed copy-back (${finalCount} != ${tmpCount}) — tmp copy ${tmp} kept`
        );
      }
      await client.deleteCollection(tmp);
      console.log(`[done] ${collection}: ${restored} points restored, tmp removed`);
      return;
    }
    console.log(`[ok] ${collection}: already declares ${BM25_SPARSE_VECTOR_NAME} — backfilling`);
    await backfill(client, collection, dryRun);
    return;
  }

  if (dryRun) {
    const count = existing.has(collection) ? await pointCount(client, collection) : 0;
    console.log(`[dry-run] ${collection}: would migrate ${count} points via ${tmp}`);
    return;
  }

  const dense = await getDenseParams(client, existing.has(collection) ? collection : tmp);

  // Phase 1: copy-out (skipped when resuming after the source was deleted)
  if (existing.has(collection)) {
    const sourceCount = await pointCount(client, collection);

    if (existing.has(tmp)) {
      const tmpCount = await pointCount(client, tmp);
      if (tmpCount !== sourceCount) {
        console.log(`  stale tmp copy (${tmpCount}/${sourceCount}) — recreating ${tmp}`);
        await client.deleteCollection(tmp);
        existing.delete(tmp);
      }
    }

    if (!existing.has(tmp)) {
      console.log(`[migrate] ${collection}: copy-out of ${sourceCount} points → ${tmp}`);
      await createWithSparse(client, tmp, schemaKey, dense);
      const copied = await copyPoints(client, collection, tmp);
      const tmpCount = await pointCount(client, tmp);
      if (tmpCount !== sourceCount) {
        throw new Error(
          `${collection}: tmp count mismatch after copy-out (${tmpCount} != ${sourceCount}) — source NOT touched`
        );
      }
      console.log(`  copy-out complete (${copied} points, verified)`);
    } else {
      console.log(`  resuming with existing tmp copy (${sourceCount} points)`);
    }

    console.log(`  deleting and recreating ${collection} with sparse config`);
    await client.deleteCollection(collection);
  } else {
    console.log(`[resume] ${collection}: source missing, restoring from ${tmp}`);
  }

  // Phase 2: recreate + copy-back
  await createWithSparse(client, collection, schemaKey, dense);
  const restored = await copyPoints(client, tmp, collection);
  const tmpCount = await pointCount(client, tmp);
  const finalCount = await pointCount(client, collection);
  if (finalCount !== tmpCount) {
    throw new Error(
      `${collection}: count mismatch after copy-back (${finalCount} != ${tmpCount}) — tmp copy ${tmp} kept`
    );
  }

  await client.deleteCollection(tmp);
  console.log(`[done] ${collection}: ${restored} points migrated, tmp removed`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  const targets = args.all
    ? Object.values(COLLECTION_SCHEMAS).map((s) => s.name)
    : [args.collection!];

  for (const collection of targets) {
    try {
      await migrate(client, collection, args.dryRun);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${collection}: ${message}`);
      process.exitCode = 1;
    }
  }
}

await main();
