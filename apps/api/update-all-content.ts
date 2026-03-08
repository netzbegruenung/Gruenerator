/**
 * Unified Content Sync
 *
 * Runs ALL content scrapers in sequence, adding only new content.
 * Each source handles its own deduplication (Qdrant URL check + content hash).
 *
 * Flags:
 *   --source <id>      Run only one source group (landesverbaende, gruenblog,
 *                       gruene-at, kommunalwiki, boell-stiftung, satzungen)
 *   --force            Force re-process even if already stored
 *   --dry-run          Preview without storing (only supported by landesverbaende)
 *   --concurrency <n>  Max parallel source groups (default: 2)
 *
 * Examples:
 *   npx tsx apps/api/update-all-content.ts                         # Sync all
 *   npx tsx apps/api/update-all-content.ts --source gruenblog      # Only Gruenblog
 *   npx tsx apps/api/update-all-content.ts --dry-run               # Preview
 *   npx tsx apps/api/update-all-content.ts --force                 # Force re-index
 *
 * Run: npx tsx apps/api/update-all-content.ts
 */

import { boellStiftungScraperService } from './services/scrapers/implementations/BoellStiftungScraper.js';
import { gruenblogScraperService } from './services/scrapers/implementations/GruenblogScraper.js';
import { grueneAtScraperService } from './services/scrapers/implementations/GrueneAtScraper.js';
import { kommunalwikiScraper } from './services/scrapers/implementations/KommunalwikiScraper.js';
import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';
import { satzungenScraperService } from './services/scrapers/implementations/SatzungenScraper.js';

interface CliArgs {
  source?: string;
  force: boolean;
  dryRun: boolean;
  concurrency: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { force: false, dryRun: false, concurrency: 2 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
        result.source = args[++i];
        break;
      case '--force':
        result.force = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--concurrency':
        result.concurrency = Math.max(1, parseInt(args[++i], 10) || 2);
        break;
    }
  }

  return result;
}

interface SourceGroupResult {
  id: string;
  name: string;
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  duration: number;
  status: 'success' | 'failed';
  error?: string;
}

interface SourceGroup {
  id: string;
  name: string;
  run: (args: CliArgs) => Promise<Omit<SourceGroupResult, 'id' | 'name' | 'duration' | 'status'>>;
}

const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: 'landesverbaende',
    name: 'Landesverbaende (all states)',
    async run(args) {
      await landesverbandScraperService.init();
      const result = await landesverbandScraperService.scrapeAllSources({
        forceUpdate: args.force,
        dryRun: args.dryRun,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      };
    },
  },
  {
    id: 'gruenblog',
    name: 'Gruenblog',
    async run(args) {
      await gruenblogScraperService.init();
      const result = await gruenblogScraperService.fullCrawl({
        forceUpdate: args.force,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      };
    },
  },
  {
    id: 'gruene-at',
    name: 'Gruene Oesterreich (gruene.at)',
    async run(args) {
      await grueneAtScraperService.init();
      const result = await grueneAtScraperService.fullCrawl({
        forceUpdate: args.force,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      };
    },
  },
  {
    id: 'kommunalwiki',
    name: 'KommunalWiki',
    async run(args) {
      await kommunalwikiScraper.init();
      const result = await kommunalwikiScraper.fullCrawl({
        forceUpdate: args.force,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      };
    },
  },
  {
    id: 'boell-stiftung',
    name: 'Heinrich-Boell-Stiftung',
    async run(args) {
      await boellStiftungScraperService.init();
      const result = await boellStiftungScraperService.fullCrawl({
        forceUpdate: args.force,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      };
    },
  },
  {
    id: 'satzungen',
    name: 'Satzungen',
    async run(args) {
      await satzungenScraperService.init();
      const result = await satzungenScraperService.fullCrawl({
        forceUpdate: args.force,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      };
    },
  },
];

const VALID_SOURCE_IDS = SOURCE_GROUPS.map((g) => g.id);

/**
 * Run async tasks with limited concurrency.
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

/**
 * Run a source group with timeout and error handling.
 */
async function runSourceGroup(group: SourceGroup, args: CliArgs): Promise<SourceGroupResult> {
  const startTime = Date.now();
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  try {
    const resultPromise = group.run(args);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after 30 minutes`)), TIMEOUT_MS)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);
    const duration = Math.round((Date.now() - startTime) / 1000);

    return {
      id: group.id,
      name: group.name,
      ...result,
      duration,
      status: 'success',
    };
  } catch (err) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  [FAIL] ${group.name}: ${message}`);

    return {
      id: group.id,
      name: group.name,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      duration,
      status: 'failed',
      error: message,
    };
  }
}

async function main() {
  const args = parseArgs();

  // Resolve which groups to run
  let groups = SOURCE_GROUPS;
  if (args.source) {
    groups = SOURCE_GROUPS.filter((g) => g.id === args.source);
    if (groups.length === 0) {
      console.error(`Unknown source: ${args.source}`);
      console.error(`Available sources: ${VALID_SOURCE_IDS.join(', ')}`);
      process.exit(1);
    }
  }

  console.log('\n========================================');
  console.log('  Content Sync — All Sources');
  console.log('========================================\n');

  console.log(`Sources: ${groups.map((g) => g.id).join(', ')}`);
  if (args.force) console.log('Mode: FORCE UPDATE');
  if (args.dryRun) console.log('Mode: DRY RUN');
  console.log(`Concurrency: ${args.concurrency}`);
  console.log('');

  const tasks = groups.map((group) => async (): Promise<SourceGroupResult> => {
    console.log(`--- [START] ${group.name} ---`);
    const result = await runSourceGroup(group, args);

    if (result.status === 'success') {
      console.log(
        `  [DONE] ${group.name}: New ${result.stored} | Updated ${result.updated} | Skipped ${result.skipped} | Errors ${result.errors} (${result.duration}s)`
      );
    }

    return result;
  });

  const results = await parallelLimit(tasks, args.concurrency);

  // Summary
  const totals = results.reduce(
    (acc, r) => ({
      stored: acc.stored + r.stored,
      updated: acc.updated + r.updated,
      skipped: acc.skipped + r.skipped,
      errors: acc.errors + r.errors,
    }),
    { stored: 0, updated: 0, skipped: 0, errors: 0 }
  );

  const failed = results.filter((r) => r.status === 'failed');
  const succeeded = results.filter((r) => r.status === 'success');

  console.log('\n========================================');
  console.log(args.dryRun ? '  DRY RUN SUMMARY' : '  SYNC SUMMARY');
  console.log('========================================');
  console.log(`  Sources:    ${results.length} (${succeeded.length} ok, ${failed.length} failed)`);
  console.log(`  New:        ${totals.stored}`);
  console.log(`  Updated:    ${totals.updated}`);
  console.log(`  Skipped:    ${totals.skipped}`);
  console.log(`  Errors:     ${totals.errors}`);
  console.log('========================================\n');

  if (totals.stored > 0) {
    console.log('New documents by source:');
    for (const r of results.filter((r) => r.stored > 0)) {
      console.log(`  ${r.id}: +${r.stored}`);
    }
    console.log('');
  }

  if (failed.length > 0) {
    console.log('Failed sources:');
    for (const r of failed) {
      console.log(`  ${r.id}: ${r.error}`);
    }
    console.log('');
  }

  process.exit(totals.errors > 0 || failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
