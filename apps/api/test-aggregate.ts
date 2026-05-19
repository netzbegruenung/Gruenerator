/**
 * Aggregate Smoke Test
 *
 * Generates N synthetic per-source summary JSON files in a temp dir, runs
 * aggregate-sync-summaries.ts on them, and verifies the merged output contains
 * all N sources. Catches regressions like the Apr 2026 artifact-collision bug,
 * where same-named files inside per-matrix artifacts collapsed to one after
 * download-artifact's merge-multiple flatten — leaving the digest with a
 * single source instead of the full set.
 *
 * Run: npx tsx apps/api/test-aggregate.ts
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type SyncSummary } from './types/syncTypes.js';

function fakeSummary(id: string): SyncSummary {
  return {
    timestamp: new Date().toISOString(),
    dryRun: false,
    force: false,
    sources: [
      {
        id,
        name: id,
        stored: 1,
        updated: 0,
        skipped: 0,
        fetchErrors: 0,
        errors: 0,
        duration: 1,
        status: 'success',
      },
    ],
    totals: {
      sources: 1,
      succeeded: 1,
      failed: 0,
      stored: 1,
      updated: 0,
      skipped: 0,
      fetchErrors: 0,
      errors: 0,
    },
    totalDuration: 1,
  };
}

const dir = mkdtempSync(path.join(tmpdir(), 'agg-test-'));
const outPath = path.join(dir, 'merged.json');

try {
  const ids = ['source-a', 'source-b', 'source-c'];
  for (const id of ids) {
    writeFileSync(path.join(dir, `summary-${id}.json`), JSON.stringify(fakeSummary(id)));
  }

  const result = spawnSync('npx', ['tsx', 'apps/api/aggregate-sync-summaries.ts', '--dir', dir], {
    env: {
      ...process.env,
      SYNC_SUMMARY_PATH: outPath,
      // Empty recipient → aggregator skips SMTP path; we're testing merging.
      CONTENT_SYNC_EMAIL: '',
      // Avoid contaminating the test from local .env Brevo creds either.
      BREVO_SMTP_HOST: '',
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`✗ aggregator exited with status ${result.status}`);
    process.exit(1);
  }

  const merged = JSON.parse(readFileSync(outPath, 'utf-8')) as SyncSummary;
  const want = ids.length;
  const got = merged.sources.length;

  if (got !== want) {
    console.error(`✗ expected ${want} sources in merged output, got ${got}`);
    console.error(`  source ids: ${JSON.stringify(merged.sources.map((s) => s.id))}`);
    process.exit(1);
  }

  if (merged.totals.stored !== want) {
    console.error(`✗ expected totals.stored=${want}, got ${merged.totals.stored}`);
    process.exit(1);
  }

  console.log(
    `✓ aggregator merged ${got} sources correctly (totals.stored=${merged.totals.stored})`
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
