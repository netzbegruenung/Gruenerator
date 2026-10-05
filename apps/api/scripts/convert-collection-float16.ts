/**
 * Converts a Qdrant collection's dense vectors to float16, under the same name.
 *
 * Qdrant cannot change a vector's datatype in place, and the server has no
 * room for a second copy, so the points travel through a local file:
 *
 *   export     all points (dense + sparse vectors, payload) → <dir>/<name>.ndjson.gz,
 *              plus the live config and payload indexes → <name>.meta.json,
 *              plus the top-10 of sample queries → <name>.reference.json
 *   recreate   delete the collection, create it again from the saved config
 *              with `datatype: float16`, restore every payload index
 *   import     upsert the file back, then compare count and top-10 overlap
 *
 * `recreate` refuses to run unless the export holds exactly the live point
 * count, so the collection is never deleted without a complete copy on disk.
 * Nothing is re-embedded. Run `--phase all` or the phases one by one.
 *
 * No writer may touch the collection from the start of `export` to the end of
 * `import`: the count check catches a new point, not an update to an existing
 * one, and an update made before the delete is overwritten by the exported
 * version. Run outside the source's content-sync slot (`landtag-nrw` and
 * `bundestag-dip` only run in the daily full sync) or disable the workflow for
 * the duration. The local file is the only full copy while the collection is
 * gone — keep it until `verify` has passed; a failed import resumes with
 * `--phase import` (upserts are idempotent).
 *
 * Usage (from apps/api):
 *   npx tsx scripts/convert-collection-float16.ts --collection abgeordnetenwatch_documents --dir /tmp/f16 --phase export
 *   npx tsx scripts/convert-collection-float16.ts --collection abgeordnetenwatch_documents --dir /tmp/f16 --phase all
 *
 * NOTE: dotenv must run before any app import (config/env.js parses the
 * environment at import time) — hence the dynamic imports below.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip, createGzip } from 'node:zlib';

import dotenv from 'dotenv';

dotenv.config();

const { env } = await import('../config/env.js');
const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');

import type { QdrantClient } from '@qdrant/js-client-rest';

const SCROLL_BATCH = 256;
// A point with its dense vector and payload is ~15 KB; 16 per upsert stays
// under the reverse proxy's body limit (see migrate-bm25-sparse.ts).
const UPSERT_BATCH = 16;
const SAMPLE_QUERIES = 50;
const TOP_K = 10;

type Phase = 'export' | 'recreate' | 'import' | 'all';

interface Meta {
  collection: string;
  pointCount: number;
  config: Record<string, unknown>;
  payloadSchema: Record<string, { data_type: string; params?: Record<string, unknown> }>;
}

interface Reference {
  queries: Array<{ id: string | number; vector: number[]; top: Array<string | number> }>;
}

function parseArgs(): { collection: string; dir: string; phase: Phase } {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const collection = get('--collection');
  const dir = get('--dir');
  const phase = (get('--phase') ?? 'all') as Phase;
  if (!collection || !dir || !['export', 'recreate', 'import', 'all'].includes(phase)) {
    console.error('Usage: --collection <name> --dir <path> [--phase export|recreate|import|all]');
    process.exit(1);
  }
  return { collection, dir, phase };
}

const paths = (dir: string, collection: string) => ({
  points: join(dir, `${collection}.ndjson.gz`),
  meta: join(dir, `${collection}.meta.json`),
  reference: join(dir, `${collection}.reference.json`),
});

/** The unnamed dense vector, whether the point came back plain or named. */
function denseOf(vector: unknown): number[] {
  if (Array.isArray(vector)) return vector as number[];
  const dense = (vector as Record<string, unknown>)[''];
  if (!Array.isArray(dense)) throw new Error('point without a dense vector');
  return dense as number[];
}

async function count(client: QdrantClient, collection: string): Promise<number> {
  return (await client.count(collection, { exact: true })).count;
}

async function topIds(
  client: QdrantClient,
  collection: string,
  vector: number[]
): Promise<Array<string | number>> {
  const res = await client.query(collection, { query: vector, limit: TOP_K, with_payload: false });
  return res.points.map((p) => p.id);
}

async function exportCollection(client: QdrantClient, collection: string, dir: string) {
  const p = paths(dir, collection);
  const info = await client.getCollection(collection);
  const expected = await count(client, collection);

  const out = createGzip();
  const done = new Promise<void>((resolve, reject) => {
    out.pipe(createWriteStream(p.points)).on('finish', resolve).on('error', reject);
  });

  const sampleEvery = Math.max(1, Math.floor(expected / SAMPLE_QUERIES));
  const samples: Array<{ id: string | number; vector: number[] }> = [];
  let written = 0;
  let offset: string | number | null | undefined;
  for (;;) {
    const page = await client.scroll(collection, {
      limit: SCROLL_BATCH,
      with_payload: true,
      with_vector: true,
      ...(offset != null && { offset }),
    });
    for (const point of page.points) {
      const line = `${JSON.stringify({ id: point.id, vector: point.vector, payload: point.payload })}\n`;
      if (!out.write(line)) await new Promise((resolve) => out.once('drain', resolve));
      if (written % sampleEvery === 0 && samples.length < SAMPLE_QUERIES) {
        samples.push({ id: point.id, vector: denseOf(point.vector) });
      }
      written++;
    }
    if (written % 10_000 < SCROLL_BATCH)
      console.log(`  export ${collection}: ${written}/${expected}`);
    offset = page.next_page_offset as string | number | null;
    if (offset == null) break;
  }
  out.end();
  await done;

  if (written !== expected) {
    throw new Error(
      `export wrote ${written} points, collection holds ${expected} — writes during export?`
    );
  }

  const meta: Meta = {
    collection,
    pointCount: written,
    config: info.config as unknown as Record<string, unknown>,
    payloadSchema: info.payload_schema as Meta['payloadSchema'],
  };
  await writeFile(p.meta, JSON.stringify(meta, null, 2));

  const reference: Reference = { queries: [] };
  for (const s of samples) {
    reference.queries.push({ ...s, top: await topIds(client, collection, s.vector) });
  }
  await writeFile(p.reference, JSON.stringify(reference));
  console.log(
    `export ${collection}: ${written} points, ${samples.length} reference queries → ${dir}`
  );
}

async function recreateCollection(client: QdrantClient, collection: string, dir: string) {
  const p = paths(dir, collection);
  const meta = JSON.parse(await readFile(p.meta, 'utf8')) as Meta;
  const live = await count(client, collection);
  if (live !== meta.pointCount) {
    throw new Error(
      `${collection} holds ${live} points, the export ${meta.pointCount} — export again before recreating`
    );
  }

  const params = meta.config.params as {
    vectors: Record<string, unknown>;
    sparse_vectors?: Record<string, unknown>;
  };
  const dense = (
    typeof params.vectors.size === 'number' ? params.vectors : params.vectors['']
  ) as Record<string, unknown>;

  await client.deleteCollection(collection);
  await client.createCollection(collection, {
    vectors: { ...dense, datatype: 'float16' },
    ...(params.sparse_vectors && { sparse_vectors: params.sparse_vectors }),
    hnsw_config: meta.config.hnsw_config,
    optimizers_config: meta.config.optimizer_config,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  for (const [field, schema] of Object.entries(meta.payloadSchema ?? {})) {
    await client.createPayloadIndex(collection, {
      field_name: field,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      field_schema: (schema.params ?? schema.data_type) as any,
      wait: true,
    });
  }
  console.log(
    `recreate ${collection}: float16, ${Object.keys(meta.payloadSchema ?? {}).length} payload indexes`
  );
}

async function importCollection(client: QdrantClient, collection: string, dir: string) {
  const p = paths(dir, collection);
  const meta = JSON.parse(await readFile(p.meta, 'utf8')) as Meta;
  const lines = createInterface({ input: createReadStream(p.points).pipe(createGunzip()) });

  let batch: unknown[] = [];
  let imported = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.upsert(collection, { wait: true, points: batch as any });
    imported += batch.length;
    batch = [];
    if (imported % 10_000 < UPSERT_BATCH) {
      console.log(`  import ${collection}: ${imported}/${meta.pointCount}`);
    }
  };
  for await (const line of lines) {
    if (!line) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= UPSERT_BATCH) await flush();
  }
  await flush();

  const live = await count(client, collection);
  console.log(
    `import ${collection}: ${imported} upserted, collection holds ${live} (export ${meta.pointCount})`
  );

  const reference = JSON.parse(await readFile(p.reference, 'utf8')) as Reference;
  let overlapSum = 0;
  let sameOrder = 0;
  for (const q of reference.queries) {
    const top = await topIds(client, collection, q.vector);
    const before = new Set(q.top.map(String));
    overlapSum += top.filter((id) => before.has(String(id))).length / TOP_K;
    if (top.map(String).join() === q.top.map(String).join()) sameOrder++;
  }
  const n = reference.queries.length;
  console.log(
    `verify ${collection}: top-${TOP_K} overlap ${((overlapSum / n) * 100).toFixed(1)} %, identical order ${sameOrder}/${n}`
  );
  if (live > meta.pointCount) {
    throw new Error(
      `${live - meta.pointCount} points arrived during the conversion — a writer was active; ` +
        'points it updated before the delete carry the exported (older) version'
    );
  }
  if (live < meta.pointCount) throw new Error('point count differs after import');
}

const { collection, dir, phase } = parseArgs();
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const client = createQdrantClient({
  url: env.QDRANT_URL ?? '',
  apiKey: env.QDRANT_API_KEY ?? '',
  basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME,
  basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD,
  timeout: 300_000,
});

if (phase === 'export' || phase === 'all') await exportCollection(client, collection, dir);
if (phase === 'recreate' || phase === 'all') await recreateCollection(client, collection, dir);
if (phase === 'import' || phase === 'all') await importCollection(client, collection, dir);
process.exit(0);
