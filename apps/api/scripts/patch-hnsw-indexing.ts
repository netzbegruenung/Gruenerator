/**
 * One-time HNSW indexing_threshold patch for existing Qdrant collections (#3119).
 *
 * PR #2770 fixed `OPTIMIZER_PRESETS` in `config/qdrantCollectionsSchema.ts` so a
 * freshly *created* collection gets `indexing_threshold` below `max_segment_size`
 * (both in KB) — otherwise no segment ever crosses the threshold and
 * `indexed_vectors_count` stays 0 forever. But `getCollectionConfig` is only ever
 * read by `createCollection`; nothing issues an `updateCollection`, so every
 * collection that already existed on 2026-08-21 kept its old (broken) config.
 * This script issues that missing `PATCH /collections/<name>` once per collection.
 *
 * Trap: `scripts/migrate-bm25-sparse.ts` recreates collections (createCollection)
 * and therefore already picks up the fixed presets on its own. Run the BM25
 * migration first; a collection it touches needs no patch here, and patching one
 * before the BM25 migration recreates it is work the recreate throws away.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/patch-hnsw-indexing.ts --collection documents
 *   npx tsx scripts/patch-hnsw-indexing.ts --all [--dry-run]
 *
 * NOTE: dotenv must run before any app import (config/env.js parses the
 * environment at import time) — hence the dynamic imports below.
 */
import { basename } from 'node:path';

import dotenv from 'dotenv';

dotenv.config();

const { env } = await import('../config/env.js');
const { COLLECTION_SCHEMAS, getCollectionConfig } =
  await import('../config/qdrantCollectionsSchema.js');
const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');

import { type QdrantClient } from '@qdrant/js-client-rest';
import { type OptimizerConfig } from '../config/qdrantCollectionsSchema.js';

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
  if ((!args.collection && !args.all) || (args.collection && args.all)) {
    console.error('Usage: patch-hnsw-indexing.ts --collection <name> | --all [--dry-run]');
    process.exit(1);
  }
  return args;
}

// =============================================================================
// Pure planning function — no I/O. Exported for patch-hnsw-indexing.vitest.ts.
// =============================================================================

export interface CollectionIndexInfo {
  indexingThreshold: number | null;
  maxSegmentSize: number | null;
  pointsCount: number;
  indexedVectorsCount: number;
  status: string;
}

export interface HnswPatchPreset {
  indexing_threshold: number;
  max_segment_size: number;
}

export type HnswPatchAction = 'skip' | 'patch';

export interface HnswPatchPlan {
  action: HnswPatchAction;
  target: number;
  reason: string;
}

/**
 * Decides whether a live collection needs its `indexing_threshold` patched to
 * the target a freshly created collection would get (`preset`, derived from
 * `getCollectionConfig` — see `presetFor` below).
 *
 * `info.indexingThreshold`/`maxSegmentSize` are `null` when the live collection
 * never had `optimizers_config` set explicitly — Qdrant then falls back to its
 * own default of 20000 KB, which is treated as "above every preset target"
 * here (an unset threshold is never known to be at or below one).
 *
 * A threshold already at or below target but `indexedVectorsCount === 0` is
 * patched anyway, with the SAME value: Qdrant's optimizer can sit in "grey"
 * (optimizations pending, awaiting an update operation), and the documented
 * remedy is any update-collection call — the value need not change. The plan
 * says so in its reason, so the log does not claim a threshold changed.
 */
export function planHnswPatch(info: CollectionIndexInfo, preset: HnswPatchPreset): HnswPatchPlan {
  const target = preset.indexing_threshold;
  const effectiveThreshold = info.indexingThreshold ?? Infinity;
  const isAtOrBelowTarget = effectiveThreshold <= target;

  if (isAtOrBelowTarget && info.indexedVectorsCount > 0) {
    return { action: 'skip', target, reason: 'already indexed' };
  }

  if (isAtOrBelowTarget && info.indexedVectorsCount === 0) {
    return {
      action: 'patch',
      target: effectiveThreshold,
      reason:
        `indexing_threshold (${info.indexingThreshold}) is already at or below the ${target} ` +
        `target, yet indexed_vectors_count is 0 (status '${info.status}'): the optimizer has not ` +
        `run. Re-sending optimizers_config with the same value is the documented trigger for a ` +
        `stalled optimizer; if the count stays 0 afterwards, the optimizer itself needs a look.`,
    };
  }

  return {
    action: 'patch',
    target,
    reason:
      `indexing_threshold (${info.indexingThreshold ?? 'unset'}) is above the ${target} target ` +
      `(max_segment_size ${info.maxSegmentSize ?? 'unset'}) — the HNSW index can never build at ` +
      `this value.`,
  };
}

// =============================================================================
// I/O
// =============================================================================

/**
 * The preset a freshly created collection of this name would get, per
 * `getCollectionConfig` (the function `createCollection` reads) — reused here
 * so the target can never drift from what #2770 actually shipped. Vector size
 * does not influence `optimizers_config`, so a placeholder is fine.
 */
function presetFor(name: string): OptimizerConfig | null {
  const schema = Object.values(COLLECTION_SCHEMAS).find((s) => s.name === name) ?? null;
  if (!schema || !schema.optimizer) return null;
  const config = getCollectionConfig(1, schema);
  return config.optimizers_config ?? null;
}

interface ReportRow {
  collection: string;
  thresholdBefore: number | null;
  thresholdAfter: number | null;
  points: number;
  indexedBefore: number;
  action: HnswPatchAction;
}

async function processCollection(
  client: QdrantClient,
  name: string,
  dryRun: boolean
): Promise<ReportRow | null> {
  const preset = presetFor(name);
  if (!preset) {
    console.log(`[skip] ${name}: no optimizer preset in COLLECTION_SCHEMAS`);
    return null;
  }

  const info = await client.getCollection(name);
  const optimizerConfig = info.config.optimizer_config;
  const indexInfo: CollectionIndexInfo = {
    indexingThreshold: optimizerConfig.indexing_threshold ?? null,
    maxSegmentSize: optimizerConfig.max_segment_size ?? null,
    pointsCount: info.points_count ?? 0,
    indexedVectorsCount: info.indexed_vectors_count ?? 0,
    status: info.status,
  };

  const plan = planHnswPatch(indexInfo, {
    indexing_threshold: preset.indexing_threshold,
    max_segment_size: preset.max_segment_size,
  });

  if (plan.action === 'skip') {
    console.log(`[skip] ${name}: ${plan.reason}`);
  } else if (dryRun) {
    console.log(
      `[dry-run] ${name}: would PATCH /collections/${name} ` +
        `{"optimizers_config":{"indexing_threshold":${plan.target}}} (${plan.reason})`
    );
  } else {
    console.log(
      `[patch] ${name}: indexing_threshold ${indexInfo.indexingThreshold ?? 'unset'} -> ${plan.target}`
    );
    await client.updateCollection(name, {
      optimizers_config: { indexing_threshold: plan.target },
    });
  }

  return {
    collection: name,
    thresholdBefore: indexInfo.indexingThreshold,
    thresholdAfter: plan.action === 'patch' ? plan.target : indexInfo.indexingThreshold,
    points: indexInfo.pointsCount,
    indexedBefore: indexInfo.indexedVectorsCount,
    action: plan.action,
  };
}

function printTable(rows: ReportRow[], dryRun: boolean): void {
  if (rows.length === 0) return;
  console.log(
    '\n' +
      'collection'.padEnd(38) +
      'threshold before -> after'.padEnd(30) +
      'points'.padEnd(10) +
      'indexed before'
  );
  for (const row of rows) {
    const before = row.thresholdBefore ?? 'unset';
    const after = row.thresholdAfter ?? 'unset';
    console.log(
      row.collection.padEnd(38) +
        `${before} -> ${after}`.padEnd(30) +
        String(row.points).padEnd(10) +
        String(row.indexedBefore)
    );
  }
  if (dryRun) {
    console.log('\n(dry-run — nothing was changed; PATCH bodies are printed above)');
  }
}

function printFollowUp(patchedCollections: string[]): void {
  if (patchedCollections.length === 0) return;
  console.log('\nIndexing runs asynchronously in Qdrant. Verify with:');
  for (const name of patchedCollections) {
    console.log(`  GET /collections/${name}   (watch indexed_vectors_count climb)`);
  }
  console.log('\nRecall check once indexed: pnpm --filter @gruenerator/api eval:retrieval:ann');
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

  const rows: ReportRow[] = [];
  for (const name of targets) {
    try {
      // `--all` walks the schema registry, which declares collections that a
      // given instance may not have created yet — those are skipped, not errors.
      if (args.all && !(await client.collectionExists(name)).exists) {
        console.log(`[skip] ${name}: not present on this instance`);
        continue;
      }
      const row = await processCollection(client, name, args.dryRun);
      if (row) rows.push(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${name}: ${message}`);
      process.exitCode = 1;
    }
  }

  printTable(rows, args.dryRun);
  printFollowUp(rows.filter((r) => r.action === 'patch').map((r) => r.collection));
}

// Only run when invoked directly — `planHnswPatch` is exported for
// `patch-hnsw-indexing.vitest.ts`, which must not trigger a CLI run on import.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  await main();
}
