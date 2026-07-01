#!/usr/bin/env npx tsx
/**
 * Backfill responsive image variants + BlurHash for existing shared media.
 *
 * For every image row in `shared_media`, (re)generates the WebP/AVIF variants
 * (in `<shareToken>/thumbs/`), the 400px `thumbnail.jpg`, and the BlurHash,
 * then merges `blurhash`/`width`/`height`/`variants` into `image_metadata` and
 * sets `thumbnail_path`. Touches only the `thumbs/` directory + that JSONB; it
 * never rescrapes or rewrites originals.
 *
 * New uploads get this automatically (sharedMediaService.processMediaVariants);
 * this script warms the cache for media uploaded before the feature landed.
 *
 * Usage:
 *   npx tsx scripts/backfillMediaVariants.ts [options]
 *
 * Options:
 *   --dry-run        List how many images would be processed; generate nothing.
 *   --limit N        Max images to process (default: unlimited).
 *   --force          Reprocess even rows that already have a blurhash.
 */

import dotenv from 'dotenv';

dotenv.config();

import { getPostgresInstance } from '../database/services/PostgresService.js';
import { getSharedMediaService } from '../services/sharedMediaService.js';

interface CliArgs {
  dryRun: boolean;
  limit: number;
  force: boolean;
}

interface ImageRow {
  share_token: string;
  file_path: string | null;
  image_metadata: { blurhash?: string } | null;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const limitIdx = argv.indexOf('--limit');
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    limit: limitIdx >= 0 ? parseInt(argv[limitIdx + 1] ?? '0', 10) || 0 : 0,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log('Backfill shared-media responsive variants + BlurHash\n');
  if (args.dryRun) console.log('Mode: dry-run (no writes)\n');

  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();
  const service = getSharedMediaService();
  await service.ensureInitialized();

  const rows = await postgres.query<ImageRow>(
    `SELECT share_token, file_path, image_metadata
       FROM shared_media
      WHERE media_type = 'image' AND file_path IS NOT NULL
      ORDER BY created_at DESC`
  );

  const pending = rows.filter((r) => args.force || !r.image_metadata?.blurhash);
  const targets = args.limit > 0 ? pending.slice(0, args.limit) : pending;

  console.log(
    `Images: ${rows.length} total, ${pending.length} missing variants` +
      `${args.limit > 0 ? `, processing ${targets.length} (--limit)` : ''}\n`
  );

  if (args.dryRun) {
    process.exit(0);
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of targets) {
    try {
      const ok = await service.regenerateMediaVariants(row.share_token, row.file_path!);
      if (ok) {
        done++;
      } else {
        skipped++;
        console.warn(`  skip ${row.share_token} (source file missing)`);
      }
    } catch (err) {
      failed++;
      console.error(`  fail ${row.share_token}:`, (err as Error).message);
    }
    if ((done + skipped + failed) % 25 === 0) {
      console.log(`  …${done + skipped + failed}/${targets.length}`);
    }
  }

  console.log(`\nDone. generated=${done} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
