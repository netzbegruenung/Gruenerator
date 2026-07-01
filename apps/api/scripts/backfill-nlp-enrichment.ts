/**
 * One-off backfill: NLP-enrich notebook documents (themes + primary_topic +
 * persons) across all in-scope Qdrant collections. Bypasses HTTP (calls the
 * service directly), so no admin token needed. Requires NLP_SERVICE_URL
 * reachable — run off-peak / overnight.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/backfill-nlp-enrichment.ts                          # all collections, force re-tag
 *   pnpm --filter @gruenerator/api exec tsx scripts/backfill-nlp-enrichment.ts --collection gruenblog_documents
 *   pnpm --filter @gruenerator/api exec tsx scripts/backfill-nlp-enrichment.ts --dry-run                # inspect derived tags, no writes
 *   pnpm --filter @gruenerator/api exec tsx scripts/backfill-nlp-enrichment.ts --missing                # only docs lacking tags
 */
import 'dotenv/config';
import {
  ENRICHMENT_COLLECTIONS,
  enrichCollection,
  type EnrichmentMode,
  type EnrichmentStats,
} from '../services/notebook/notebookEnrichmentService.js';

function parseArgs(argv: string[]): {
  collection: string | null;
  dryRun: boolean;
  mode: EnrichmentMode;
} {
  let collection: string | null = null;
  let dryRun = false;
  // Backfill re-tags everything by default; --missing limits to untagged/changed docs.
  let mode: EnrichmentMode = 'all';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--collection') collection = argv[++i] ?? null;
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--missing') mode = 'missing';
  }
  return { collection, dryRun, mode };
}

async function main() {
  const { collection, dryRun, mode } = parseArgs(process.argv.slice(2));
  const targets = collection ? [collection] : [...ENRICHMENT_COLLECTIONS];

  console.log(
    `NLP enrichment backfill — mode=${mode}${dryRun ? ' (dry-run)' : ''}, collections: ${targets.join(', ')}`
  );

  const results: EnrichmentStats[] = [];
  for (const c of targets) {
    results.push(await enrichCollection(c, { mode, dryRun }));
  }

  console.table(results);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
