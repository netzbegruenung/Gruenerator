#!/usr/bin/env tsx
/**
 * Generic single-source LV sync — runs LandesverbandScraper.scrapeSource for
 * one or more source IDs passed as args. Use --force to re-process URLs already
 * in Qdrant (default: skip-by-source_url, only fetches new articles).
 *
 * Usage:
 *   npx tsx sync-source.ts [--force] <source-id> [<source-id> ...]
 *
 * Examples:
 *   npx tsx sync-source.ts thueringen-lv
 *   npx tsx sync-source.ts --force sachsen-anhalt-fraktion
 *   npx tsx sync-source.ts --force brandenburg-archive-presse brandenburg-archive-beschluesse
 *
 * Env: requires .env (Qdrant + Mistral creds). Run with `--env-file=.env --import tsx`
 * via node when invoking outside the monorepo's standard launcher.
 */

import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const sourceIds = args.filter((a) => !a.startsWith('--'));

if (sourceIds.length === 0) {
  console.error('Usage: sync-source.ts [--force] <source-id> [<source-id> ...]');
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`\n[sync-source] starting — force=${force} sources=${sourceIds.join(', ')}\n`);
  await landesverbandScraperService.init();

  const startAll = Date.now();
  const results: Record<string, { stored: number; updated: number; skipped: number; errors: number }> = {};

  for (const id of sourceIds) {
    const start = Date.now();
    console.log(`\n═══ ${id} ═══`);
    try {
      const r = await landesverbandScraperService.scrapeSource(id, { forceUpdate: force });
      const dur = Math.round((Date.now() - start) / 1000);
      results[id] = { stored: r.stored, updated: r.updated, skipped: r.skipped, errors: r.errors };
      console.log(
        `[${id}] stored=${r.stored} updated=${r.updated} skipped=${r.skipped} errors=${r.errors} (${dur}s)`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[${id}] FAILED: ${msg}`);
      results[id] = { stored: 0, updated: 0, skipped: 0, errors: 1 };
    }
  }

  const totalDur = Math.round((Date.now() - startAll) / 1000);
  console.log('\n═══ SUMMARY ═══');
  for (const [id, r] of Object.entries(results)) {
    console.log(`  ${id}: stored=${r.stored} updated=${r.updated} skipped=${r.skipped} errors=${r.errors}`);
  }
  console.log(`Total duration: ${totalDur}s\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
