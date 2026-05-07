/**
 * Linkup Smoke Test
 *
 * Exercises both Linkup modes the new integration uses:
 *   1. webSearch (depth=standard)  — replaces SearXNG for @websuche / @search
 *   2. deepResearch (depth=deep)   — replaces orchestrator for @recherche
 *
 * Usage:
 *   npx tsx apps/api/test-linkup.ts
 *   npx tsx apps/api/test-linkup.ts --skip-deep    # standard only (deep is slow + expensive)
 *   npx tsx apps/api/test-linkup.ts --query "..."
 *
 * Requires LINKUP_API_KEY in env (apps/api/.env or root .env).
 * Exits 0 on success, 1 on any failure.
 */

import 'dotenv/config';

import { getLinkupService } from './services/search/LinkupService.js';

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main(): Promise<void> {
  const linkup = getLinkupService();
  if (!linkup) {
    console.error('FAIL: LINKUP_API_KEY is not set — getLinkupService() returned null.');
    process.exit(1);
  }

  const query = arg('query') ?? 'aktuelle Position der Grünen zur Schuldenbremse';

  console.log('━━━ 1. webSearch (depth=standard) ━━━');
  console.log(`query: ${query}`);
  const t1 = Date.now();
  const web = await linkup.webSearch({ query, maxResults: 5 });
  const dt1 = Date.now() - t1;
  console.log(`✓ ${web.results.length} results in ${dt1}ms`);
  web.results.slice(0, 5).forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.name?.slice(0, 80) ?? '(no title)'}`);
    console.log(`      ${r.url}`);
    console.log(`      ${(r.content ?? '').slice(0, 120).replace(/\s+/g, ' ')}…`);
  });
  if (web.results.length === 0) {
    console.error('FAIL: webSearch returned 0 results.');
    process.exit(1);
  }

  if (flag('skip-deep')) {
    console.log('\n(skipping deepResearch per --skip-deep)');
    process.exit(0);
  }

  console.log('\n━━━ 2. deepResearch (depth=deep) ━━━');
  console.log(`question: ${query}`);
  console.log('(this can take 30-90s)…');
  const t2 = Date.now();
  const deep = await linkup.deepResearch({ question: query, locale: 'de' });
  const dt2 = Date.now() - t2;
  console.log(`✓ answer ${deep.answer.length} chars, ${deep.sources.length} sources in ${dt2}ms`);
  console.log('\n--- answer (first 600 chars) ---');
  console.log(deep.answer.slice(0, 600) + (deep.answer.length > 600 ? '…' : ''));
  console.log('\n--- sources ---');
  deep.sources.slice(0, 8).forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.name?.slice(0, 80) ?? '(no name)'} — ${s.url}`);
  });
  if (deep.sources.length === 0) {
    console.error('FAIL: deepResearch returned 0 sources.');
    process.exit(1);
  }
  if (deep.answer.trim().length < 100) {
    console.error('FAIL: deepResearch answer suspiciously short.');
    process.exit(1);
  }

  console.log('\n✓ All Linkup smoke tests passed.');
}

main().catch((err: unknown) => {
  console.error('\nFAIL:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
