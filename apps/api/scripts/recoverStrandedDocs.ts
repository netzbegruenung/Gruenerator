#!/usr/bin/env npx tsx
/**
 * Recover Stranded Collaborative Documents
 *
 * Finds documents in `collaborative_documents` that have a non-empty `content`
 * column but no Yjs persistence rows (`yjs_document_snapshots`, `yjs_document_updates`)
 * AND no `collaborative_documents_init` seed. These docs open empty in the
 * editor because Hocuspocus's bootstrap path can't rehydrate plaintext.
 *
 * For each affected doc, normalize content via `ensureHtml` and seed
 * `collaborative_documents_init` via `seedYjsState`. Idempotent
 * (ON CONFLICT DO NOTHING) — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/recoverStrandedDocs.ts [--dry-run]
 */

import dotenv from 'dotenv';

dotenv.config();

import { getPostgresInstance } from '../database/services/PostgresService/PostgresService.js';
import { ensureHtml } from '../services/docs/contentNormalization.js';
import { seedYjsState } from '../services/docs/seedYjsState.js';

interface StrandedRow {
  id: string;
  title: string;
  document_subtype: string;
  content: string;
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const pg = getPostgresInstance();
  await pg.init();

  // Bounded scan: re-run the script if more than 1000 docs are stranded.
  const rows = (await pg.query(`
    SELECT cd.id, cd.title, cd.document_subtype, cd.content
    FROM collaborative_documents cd
    LEFT JOIN yjs_document_snapshots s ON s.document_id = cd.id
    LEFT JOIN yjs_document_updates   u ON u.document_id = cd.id
    LEFT JOIN collaborative_documents_init i ON i.document_id = cd.id
    WHERE cd.is_deleted = false
      AND s.document_id IS NULL
      AND u.document_id IS NULL
      AND i.document_id IS NULL
      AND cd.content IS NOT NULL
      AND length(trim(cd.content)) > 0
    ORDER BY cd.updated_at DESC
    LIMIT 1000
  `)) as StrandedRow[];

  console.log(
    `[recoverStrandedDocs] Found ${rows.length} stranded doc(s)${DRY_RUN ? ' (dry-run)' : ''}`
  );

  if (rows.length === 0) {
    console.log('[recoverStrandedDocs] Nothing to do.');
    return;
  }

  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const html = ensureHtml(row.content);
    if (!html.trim()) {
      console.log(`  ✗ ${row.id}: ${row.title} — content normalized to empty, skipping`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `  ~ ${row.id}: ${row.title} (${row.content.length} chars → ${html.length} HTML)`
      );
      continue;
    }

    try {
      const wrote = await seedYjsState(row.id, html);
      if (wrote) {
        console.log(`  ✓ ${row.id}: ${row.title} — seeded init_data`);
        recovered++;
      } else {
        console.log(`  ~ ${row.id}: ${row.title} — no blocks produced, skipping`);
        skipped++;
      }
    } catch (err) {
      console.error(
        `  ✗ ${row.id}: ${row.title} — ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  console.log(
    `[recoverStrandedDocs] Done: recovered=${recovered}, skipped=${skipped}, failed=${failed}, total=${rows.length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[recoverStrandedDocs] Fatal error:', err);
    process.exit(1);
  });
