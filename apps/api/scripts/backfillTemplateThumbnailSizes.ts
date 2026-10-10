#!/usr/bin/env npx tsx
/**
 * Backfill `metadata.thumbnail_size` for existing Vorlagen.
 *
 * New and edited templates are measured by enrichTemplate; this script covers
 * the ones created before that. Rows that already carry a size for their
 * current thumbnail URL are skipped, so re-running is cheap.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfillTemplateThumbnailSizes.ts [--dry-run] [--limit N]
 */

import { getPostgresInstance } from '../database/services/PostgresService.js';
import { ensureThumbnailSize } from '../services/templates/thumbnailSize.js';

interface TemplateRow {
  id: string;
  thumbnail_url: string;
  metadata: { thumbnail_size?: { url?: string } } | null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1] ?? '0', 10) || 0 : 0;

  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const rows = await postgres.query<TemplateRow>(
    `SELECT id, thumbnail_url, metadata
       FROM user_templates
      WHERE thumbnail_url IS NOT NULL AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    [],
    { table: 'user_templates' }
  );

  const pending = rows.filter((r) => r.metadata?.thumbnail_size?.url !== r.thumbnail_url);
  const targets = limit > 0 ? pending.slice(0, limit) : pending;
  console.log(`Templates: ${rows.length} with thumbnail, ${pending.length} unmeasured`);
  if (dryRun) process.exit(0);

  let measured = 0;
  let failed = 0;
  for (const row of targets) {
    try {
      const size = await ensureThumbnailSize(row.id, row.thumbnail_url, row.metadata);
      if (size) {
        measured++;
        console.log(`  ✓ ${row.id} ${size.width}×${size.height}`);
      } else {
        failed++;
        console.log(`  – ${row.id} not measurable`);
      }
    } catch (error) {
      failed++;
      console.log(`  ✗ ${row.id} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\nDone: ${measured} measured, ${failed} not measured`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
