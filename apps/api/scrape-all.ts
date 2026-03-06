/**
 * Update All Landesverbände
 *
 * Scrapes ALL configured sources for new content (skips already-stored URLs).
 * Use this to catch up on new Pressemitteilungen, Beschlüsse, Anträge, etc.
 *
 * Sources run in parallel (default concurrency: 3) for faster updates.
 * Each source still processes its own pages sequentially with crawl delays.
 *
 * Flags:
 *   --source <id>         Run only a specific source (e.g., berlin-lv-presse)
 *   --landesverband <lv>  Run only sources for a Landesverband (e.g., BE, MV, HH)
 *   --type <type>         Run only landesverband or fraktion sources
 *   --content <type>      Run only a content type (presse, beschluss, antrag, blog)
 *   --force               Force re-process even if already stored
 *   --dry-run             Extract links, check Qdrant, show new vs existing counts
 *   --concurrency <n>     Max parallel sources (default: 3)
 *
 * Examples:
 *   npx tsx apps/api/scrape-all.ts                          # Update everything
 *   npx tsx apps/api/scrape-all.ts --landesverband BE       # Only Berlin sources
 *   npx tsx apps/api/scrape-all.ts --content presse         # Only Pressemitteilungen
 *   npx tsx apps/api/scrape-all.ts --type fraktion          # Only Fraktionen
 *   npx tsx apps/api/scrape-all.ts --dry-run                # Preview what would run
 *   npx tsx apps/api/scrape-all.ts --concurrency 5          # 5 sources in parallel
 *
 * Run: npx tsx apps/api/scrape-all.ts
 */

import {
  LANDESVERBAENDE_CONFIG,
  type LandesverbandSource,
  type SourceType,
  type ContentType,
} from './config/landesverbaendeConfig.js';
import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

interface CliArgs {
  source?: string;
  landesverband?: string;
  type?: SourceType;
  content?: ContentType;
  force: boolean;
  dryRun: boolean;
  concurrency: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { force: false, dryRun: false, concurrency: 3 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
        result.source = args[++i];
        break;
      case '--landesverband':
        result.landesverband = args[++i];
        break;
      case '--type':
        result.type = args[++i] as SourceType;
        break;
      case '--content':
        result.content = args[++i] as ContentType;
        break;
      case '--force':
        result.force = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--concurrency':
        result.concurrency = Math.max(1, parseInt(args[++i], 10) || 3);
        break;
    }
  }

  return result;
}

interface SourceSummary {
  sourceId: string;
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Run async tasks with limited concurrency.
 * Executes up to `limit` tasks at a time, starting the next as each completes.
 */
async function parallelLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

function resolveSources(args: CliArgs): LandesverbandSource[] {
  let sources = [...LANDESVERBAENDE_CONFIG.sources];

  if (args.source) {
    sources = sources.filter((s) => s.id === args.source);
    if (sources.length === 0) {
      console.error(`Source not found: ${args.source}`);
      console.error(
        'Available sources:',
        LANDESVERBAENDE_CONFIG.sources.map((s) => s.id).join(', ')
      );
      process.exit(1);
    }
  }

  if (args.landesverband) {
    sources = sources.filter(
      (s) => s.shortName === args.landesverband || s.shortName.startsWith(args.landesverband!)
    );
  }

  if (args.type) {
    sources = sources.filter((s) => s.type === args.type);
  }

  return sources;
}

async function main() {
  const args = parseArgs();
  const sources = resolveSources(args);

  console.log('\n========================================');
  console.log('  Landesverbaende Update - All Sources');
  console.log('========================================\n');

  if (args.landesverband) console.log(`Filter: Landesverband = ${args.landesverband}`);
  if (args.type) console.log(`Filter: Type = ${args.type}`);
  if (args.content) console.log(`Filter: Content = ${args.content}`);
  console.log(`Sources: ${sources.length}\n`);

  for (const source of sources) {
    const contentTypes = args.content
      ? source.contentPaths.filter((cp) => cp.type === args.content).map((cp) => cp.type)
      : source.contentPaths.map((cp) => cp.type);

    if (contentTypes.length === 0) continue;

    console.log(`  ${source.id} (${source.name})`);
    console.log(`    URL: ${source.baseUrl}`);
    console.log(`    CMS: ${source.cms} | Content: ${contentTypes.join(', ')}`);
  }

  if (args.dryRun) console.log('\n[DRY RUN] Extracting links and checking Qdrant...');
  if (args.force) console.log('Mode: FORCE UPDATE (re-process existing)');
  console.log(`Concurrency: ${args.concurrency} sources in parallel`);

  console.log('\nInitializing scraper...');
  await landesverbandScraperService.init();

  // Filter sources that have matching content types
  const activeSources = sources.filter((source) => {
    const contentTypes = args.content
      ? source.contentPaths.filter((cp) => cp.type === args.content)
      : source.contentPaths;
    return contentTypes.length > 0;
  });

  // Build parallel tasks — one per source
  const tasks = activeSources.map((source) => async (): Promise<SourceSummary> => {
    console.log(`\n--- [START] ${source.name} ---`);

    try {
      const result = await landesverbandScraperService.scrapeSource(source.id, {
        forceUpdate: args.force,
        contentType: args.content,
        dryRun: args.dryRun,
      });

      if (args.dryRun) {
        console.log(
          `  [DONE] ${source.name}: Would add ${result.stored} new | Already stored: ${result.skipped}`
        );
      } else {
        console.log(
          `  [DONE] ${source.name}: New ${result.stored} | Updated ${result.updated} | Skipped ${result.skipped} | Errors ${result.errors}`
        );
      }

      return {
        sourceId: source.id,
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      };
    } catch (err) {
      console.error(`  [FAIL] ${source.name}: ${err instanceof Error ? err.message : err}`);
      return { sourceId: source.id, stored: 0, updated: 0, skipped: 0, errors: 1 };
    }
  });

  const summary = await parallelLimit(tasks, args.concurrency);

  // Final summary
  const totals = summary.reduce(
    (acc, s) => ({
      stored: acc.stored + s.stored,
      updated: acc.updated + s.updated,
      skipped: acc.skipped + s.skipped,
      errors: acc.errors + s.errors,
    }),
    { stored: 0, updated: 0, skipped: 0, errors: 0 }
  );

  console.log('\n========================================');
  console.log(args.dryRun ? '  DRY RUN SUMMARY' : '  SUMMARY');
  console.log('========================================');
  console.log(`  Sources checked: ${summary.length}`);
  console.log(`  ${args.dryRun ? 'Would add' : 'New documents'}:   ${totals.stored}`);
  if (!args.dryRun) console.log(`  Updated:         ${totals.updated}`);
  console.log(`  Already stored:  ${totals.skipped}`);
  console.log(`  Errors:          ${totals.errors}`);
  console.log('========================================\n');

  if (totals.stored > 0) {
    console.log(`${args.dryRun ? 'New documents' : 'Stored'} by source:`);
    for (const s of summary.filter((s) => s.stored > 0)) {
      console.log(`  ${s.sourceId}: +${s.stored}`);
    }
  } else {
    console.log('All sources are up to date.');
  }

  process.exit(totals.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
