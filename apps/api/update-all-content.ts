/**
 * Unified Content Sync
 *
 * Runs ALL content scrapers in sequence, adding only new content.
 * Each source handles its own deduplication (Qdrant URL check + content hash).
 *
 * Flags:
 *   --source <id>      Run only one source group (landesverbaende, gruenblog,
 *                       gruene-at, kommunalwiki, boell-stiftung)
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

import { Mistral } from '@mistralai/mistralai';

import { sendContentSyncEmail } from './services/email/emailService.js';
import { boellStiftungScraperService } from './services/scrapers/implementations/BoellStiftungScraper.js';
import { gruenblogScraperService } from './services/scrapers/implementations/GruenblogScraper.js';
import { grueneAtScraperService } from './services/scrapers/implementations/GrueneAtScraper.js';
import { kommunalwikiScraper } from './services/scrapers/implementations/KommunalwikiScraper.js';
import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

interface CliArgs {
  source?: string;
  force: boolean;
  dryRun: boolean;
  concurrency: number;
  noEmail: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { force: false, dryRun: false, concurrency: 2, noEmail: false };

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
      case '--no-email':
        result.noEmail = true;
        break;
    }
  }

  return result;
}

import { type SourceGroupResult, type SyncSummary } from './types/syncTypes.js';

interface SourceGroup {
  id: string;
  name: string;
  timeoutMs?: number;
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
    timeoutMs: 45 * 60 * 1000,
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
];

const VALID_SOURCE_IDS = SOURCE_GROUPS.map((g) => g.id);

/**
 * Preflight check: verify that required infrastructure (Mistral API, Qdrant) is reachable
 * before spending 20+ minutes crawling pages that can never be stored.
 */
async function preflight(): Promise<void> {
  const errors: string[] = [];

  // Check MISTRAL_API_KEY
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey || mistralKey.trim() === '') {
    errors.push('MISTRAL_API_KEY is not set — embeddings will fail');
  } else {
    try {
      const client = new Mistral({ apiKey: mistralKey });
      const resp = await client.models.list();
      if (!resp?.data?.length) {
        errors.push('Mistral API returned no models — key may be invalid');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Mistral API unreachable: ${msg}`);
    }
  }

  // Check QDRANT_URL + QDRANT_API_KEY
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantKey = process.env.QDRANT_API_KEY;
  if (!qdrantUrl || qdrantUrl.trim() === '') {
    errors.push('QDRANT_URL is not set — vector storage will fail');
  } else if (!qdrantKey || qdrantKey.trim() === '') {
    errors.push('QDRANT_API_KEY is not set — vector storage will fail');
  } else {
    try {
      const healthUrl = qdrantUrl.replace(/\/+$/, '') + '/healthz';
      const headers: Record<string, string> = { 'api-key': qdrantKey };
      const basicUser = process.env.QDRANT_BASIC_AUTH_USERNAME;
      const basicPass = process.env.QDRANT_BASIC_AUTH_PASSWORD;
      if (basicUser && basicPass) {
        headers['Authorization'] =
          `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString('base64')}`;
      }
      const resp = await fetch(healthUrl, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        errors.push(`Qdrant health check returned HTTP ${resp.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Qdrant unreachable at ${qdrantUrl}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    console.error('\n========================================');
    console.error('  PREFLIGHT CHECK FAILED');
    console.error('========================================');
    for (const e of errors) {
      console.error(`  ✗ ${e}`);
    }
    console.error('========================================');
    console.error('Aborting sync — fix the issues above and retry.\n');
    process.exit(1);
  }

  console.log('Preflight: Mistral API ✓, Qdrant ✓\n');
}

import { parallelLimit } from './utils/parallelLimit.js';

/**
 * Run a source group with timeout and error handling.
 */
async function runSourceGroup(group: SourceGroup, args: CliArgs): Promise<SourceGroupResult> {
  const startTime = Date.now();
  const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const timeoutMs = group.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutMinutes = Math.round(timeoutMs / 60_000);

  try {
    const resultPromise = group.run(args);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMinutes} minutes`)), timeoutMs)
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

import { writeFileSync } from 'node:fs';
import path from 'node:path';

async function main() {
  const args = parseArgs();
  const syncStart = Date.now();

  if (!args.dryRun) {
    await preflight();
  }

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

  // Write structured summary JSON for CI consumption
  const summary: SyncSummary = {
    timestamp: new Date().toISOString(),
    dryRun: args.dryRun,
    force: args.force,
    sources: results,
    totals: {
      sources: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      stored: totals.stored,
      updated: totals.updated,
      skipped: totals.skipped,
      errors: totals.errors,
    },
    totalDuration: Math.round((Date.now() - syncStart) / 1000),
  };

  const summaryPath =
    process.env.SYNC_SUMMARY_PATH || path.join(process.cwd(), 'sync-summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Summary written to ${summaryPath}`);

  // Send email notification via existing Brevo SMTP (never crash on email failure)
  const emailTo = process.env.CONTENT_SYNC_EMAIL;
  if (emailTo && !args.noEmail) {
    try {
      const runId = process.env.GITHUB_RUN_ID;
      const repo = process.env.GITHUB_REPOSITORY;
      const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
      const runUrl = runId && repo ? `${server}/${repo}/actions/runs/${runId}` : undefined;

      const sent = await sendContentSyncEmail(emailTo, {
        timestamp: summary.timestamp,
        totalDuration: summary.totalDuration,
        sources: summary.sources,
        totals: summary.totals,
        runUrl,
        dryRun: args.dryRun,
      });
      console.log(
        sent ? `Email sent to ${emailTo}` : 'Email sending skipped (SMTP not configured)'
      );
    } catch (err) {
      console.error(
        'Email notification failed (non-fatal):',
        err instanceof Error ? err.message : err
      );
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
