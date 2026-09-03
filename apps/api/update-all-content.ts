/**
 * Unified Content Sync
 *
 * Runs ALL content scrapers in sequence, adding only new content.
 * Each source handles its own deduplication (Qdrant URL check + content hash).
 *
 * Flags:
 *   --source <id>            Run only one source group (landesverbaende, gruenblog,
 *                             gruene-at, kommunalwiki, boell-stiftung, bundestag)
 *   --landesverband <code>   Run only one Landesverband by shortName prefix
 *                             (e.g. BE = Berlin, BB = Brandenburg, HH = Hamburg,
 *                             LSA = Sachsen-Anhalt, MV = Mecklenburg-Vorpommern,
 *                             TH = Thüringen). Email recipient is read from
 *                             apps/api/config/landesverbaendeContacts.json and
 *                             only sent when stored/updated/errors > 0.
 *   --force                  Force re-process even if already stored
 *   --recent                 Incremental: only discover the newest items (WP REST
 *                             modified_after window; first pages of HTML listings).
 *                             For hourly runs; the nightly run omits it for a full walk.
 *   --dry-run                Preview without storing (only supported by landesverbaende)
 *   --concurrency <n>        Max parallel source groups (default: 2)
 *
 * Examples:
 *   npx tsx apps/api/update-all-content.ts                              # Sync all
 *   npx tsx apps/api/update-all-content.ts --source gruenblog           # Only Gruenblog
 *   npx tsx apps/api/update-all-content.ts --landesverband BE           # Only Berlin LV
 *   npx tsx apps/api/update-all-content.ts --dry-run                    # Preview
 *   npx tsx apps/api/update-all-content.ts --force                      # Force re-index
 *
 * Run: npx tsx apps/api/update-all-content.ts
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { Mistral } from '@mistralai/mistralai';

import { env } from './config/env.js';
import {
  getSourcesByLandesverband,
  loadLandesverbandContacts,
} from './config/landesverbaendeConfig.js';
import { sendContentSyncEmail } from './services/email/emailService.js';
import { drainExtractionStats } from './services/scrapers/extractionRecorder.js';
import { getAbgeordnetenwatchScraperService } from './services/scrapers/implementations/AbgeordnetenwatchScraper/index.js';
import { boellStiftungScraperService } from './services/scrapers/implementations/BoellStiftungScraper.js';
import { bundestagScraperService } from './services/scrapers/implementations/BundestagScraper/index.js';
import { gruenblogScraperService } from './services/scrapers/implementations/GruenblogScraper.js';
import { grueneAtScraperService } from './services/scrapers/implementations/GrueneAtScraper.js';
import { grueneDeScraperService } from './services/scrapers/implementations/GrueneDeScraper.js';
import { kommunalwikiScraper } from './services/scrapers/implementations/KommunalwikiScraper.js';
import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';
import {
  grundsatzPdfScraperService,
  oesterreichPdfScraperService,
} from './services/scrapers/implementations/ProgramPdfScraper.js';
import { scrapeAndIndexSocialMedia } from './services/scrapers/implementations/SocialMediaExamplesScraper.js';
import { drainSyncEvents } from './services/scrapers/syncEventRecorder.js';
import { type SourceGroupResult, type SyncSummary } from './types/syncTypes.js';

interface CliArgs {
  source?: string;
  landesverband?: string;
  force: boolean;
  dryRun: boolean;
  /** Incremental run: discover only the newest items (hourly). Off = full walk (nightly). */
  recent: boolean;
  concurrency: number;
  noEmail: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    force: false,
    dryRun: false,
    recent: false,
    concurrency: 2,
    noEmail: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
        result.source = args[++i];
        break;
      case '--landesverband':
        result.landesverband = args[++i];
        break;
      case '--force':
        result.force = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--recent':
        result.recent = true;
        break;
      case '--concurrency':
        result.concurrency = Math.max(1, parseInt(args[++i], 10) || 2);
        break;
      case '--no-email':
        result.noEmail = true;
        break;
      default:
        break;
    }
  }

  return result;
}

interface SourceGroup {
  id: string;
  name: string;
  timeoutMs?: number;
  run: (args: CliArgs) => Promise<Omit<SourceGroupResult, 'id' | 'name' | 'duration' | 'status'>>;
}

/**
 * Report a Landesverband scrape result without inventing an error taxonomy.
 *
 * Both Landesverband paths used to return `fetchErrors: result.errors, errors: 0`,
 * which made a scrape that failed outright look identical to one that merely
 * missed a few pages. The per-LV email fires on `stored + updated + errors > 0`,
 * so a Landesverband storing nothing at all printed "Unreachable 1 | Errors 0"
 * and notified nobody — that is how Saarland produced zero documents unnoticed.
 *
 * Unlike the gruenblog / gruene-at / böll scrapers, this one reports a single
 * undifferentiated `errors` count; its `skipReasons` count skips (`too_old`,
 * `unchanged`, …), not failures, so there is nothing to split. `fetchErrors: 0`
 * says exactly that instead of guessing.
 */
function reportLandesverbandResult(result: {
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  skipReasons: Record<string, number>;
}): {
  stored: number;
  updated: number;
  skipped: number;
  fetchErrors: number;
  errors: number;
  skipReasons: Record<string, number>;
} {
  return {
    stored: result.stored,
    updated: result.updated,
    skipped: result.skipped,
    fetchErrors: 0,
    errors: result.errors,
    skipReasons: result.skipReasons,
  };
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
        recent: args.recent,
      });
      return reportLandesverbandResult(result);
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
      const fetchErrors = result.skipReasons?.fetch_error?.count ?? 0;
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors,
        errors: Math.max(0, result.errors - fetchErrors),
      };
    },
  },
  {
    id: 'gruene-at',
    name: 'Gruene Oesterreich (gruene.at)',
    timeoutMs: 45 * 60 * 1000,
    async run(args) {
      await grueneAtScraperService.init();
      const result = await grueneAtScraperService.fullCrawl({
        forceUpdate: args.force,
      });
      const fetchErrors = result.skipReasons?.fetch_error?.count ?? 0;
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors,
        errors: Math.max(0, result.errors - fetchErrors),
      };
    },
  },
  {
    id: 'gruene-de',
    name: 'Gruene Deutschland (gruene.de)',
    timeoutMs: 45 * 60 * 1000,
    async run(args) {
      await grueneDeScraperService.init();
      const result = await grueneDeScraperService.fullCrawl({
        forceUpdate: args.force,
      });
      const fetchErrors = result.skipReasons?.fetch_error?.count ?? 0;
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors,
        errors: Math.max(0, result.errors - fetchErrors),
      };
    },
  },
  {
    id: 'grundsatz',
    name: 'Grundsatzprogramme (PDF)',
    timeoutMs: 30 * 60 * 1000,
    async run(args) {
      await grundsatzPdfScraperService.init();
      const result = await grundsatzPdfScraperService.fullCrawl({
        forceUpdate: args.force,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors: 0,
        errors: result.errors,
      };
    },
  },
  {
    id: 'oesterreich',
    name: 'Die Gruenen Oesterreich – Programme (PDF)',
    timeoutMs: 30 * 60 * 1000,
    async run(args) {
      await oesterreichPdfScraperService.init();
      const result = await oesterreichPdfScraperService.fullCrawl({
        forceUpdate: args.force,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors: 0,
        errors: result.errors,
      };
    },
  },
  {
    id: 'abgeordnetenwatch',
    name: 'Abgeordnetenwatch (Abstimmungen + Nebentätigkeiten)',
    // Full backfill enriches ~1,900 Abstimmungen with one votes-call each
    // (Grünen stance) at the fair-use limit → allow up to ~90 min. `--recent`
    // runs are minutes (current-legislature polls + newest sidejobs only).
    timeoutMs: 90 * 60 * 1000,
    async run(args) {
      const service = getAbgeordnetenwatchScraperService();
      await service.init();
      const result = await service.scrapeAllSources({
        forceUpdate: args.force,
        recent: args.recent,
        dryRun: args.dryRun,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors: result.fetchErrors,
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
        fetchErrors: result.errors,
        errors: 0,
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
      const fetchErrors = result.skipReasons?.fetch_error?.count ?? 0;
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors,
        errors: Math.max(0, result.errors - fetchErrors),
      };
    },
  },
  {
    id: 'bundestag',
    name: 'Grüne Bundestagsfraktion (gruene-bundestag.de)',
    timeoutMs: 20 * 60 * 1000,
    async run(args) {
      await bundestagScraperService.init();
      const result = await bundestagScraperService.scrapeAllSources({
        forceUpdate: args.force,
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors: 0,
        errors: result.errors,
      };
    },
  },
  {
    id: 'social-media',
    name: 'Social Media Examples (Instagram + Facebook)',
    timeoutMs: 30 * 60 * 1000,
    async run(args) {
      const result = await scrapeAndIndexSocialMedia({
        forceUpdate: args.force,
        ...(args.landesverband && { landesverband: args.landesverband }),
      });
      return {
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        fetchErrors: result.fetchErrors,
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
  const mistralKey = env.MISTRAL_API_KEY;
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
  const qdrantUrl = env.QDRANT_URL;
  const qdrantKey = env.QDRANT_API_KEY;
  if (!qdrantUrl || qdrantUrl.trim() === '') {
    errors.push('QDRANT_URL is not set — vector storage will fail');
  } else if (!qdrantKey || qdrantKey.trim() === '') {
    errors.push('QDRANT_API_KEY is not set — vector storage will fail');
  } else {
    try {
      const healthUrl = qdrantUrl.replace(/\/+$/, '') + '/healthz';
      const headers: Record<string, string> = { 'api-key': qdrantKey };
      const basicUser = env.QDRANT_BASIC_AUTH_USERNAME;
      const basicPass = env.QDRANT_BASIC_AUTH_PASSWORD;
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
      fetchErrors: 0,
      errors: 1,
      duration,
      status: 'failed',
      error: message,
    };
  }
}

async function main() {
  const args = parseArgs();
  const syncStart = Date.now();

  if (!args.dryRun) {
    await preflight();
  }

  // Resolve which groups to run
  let groups = SOURCE_GROUPS;
  if (args.landesverband) {
    const lvCode = args.landesverband;
    const matchingSources = getSourcesByLandesverband(lvCode);
    if (matchingSources.length === 0) {
      console.error(`Unknown landesverband: ${lvCode}`);
      console.error(
        `Hint: shortName prefix from landesverbaendeConfig.ts (e.g. BB, BE, HH, LSA, MV, TH)`
      );
      process.exit(1);
    }
    groups = [
      {
        id: `landesverband-${lvCode}`,
        name: `Landesverband ${lvCode} (${matchingSources.length} sources)`,
        // Large LVs (BE, HH) crawl 4+ sources with PDF/OCR and outgrow the 30 min
        // default. Kept under the workflow's 60 min job limit so the timeout still
        // fires inside the script (clean summary/email) instead of a hard CI cancel.
        timeoutMs: 50 * 60 * 1000,
        async run(a) {
          await landesverbandScraperService.init();
          const result = await landesverbandScraperService.scrapeAllSources({
            forceUpdate: a.force,
            dryRun: a.dryRun,
            recent: a.recent,
            landesverband: lvCode,
          });
          return reportLandesverbandResult(result);
        },
      },
    ];
  } else if (args.source) {
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
        `  [DONE] ${group.name}: New ${result.stored} | Updated ${result.updated} | Skipped ${result.skipped} | Unreachable ${result.fetchErrors ?? 0} | Errors ${result.errors} (${result.duration}s)`
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
      fetchErrors: acc.fetchErrors + (r.fetchErrors ?? 0),
      errors: acc.errors + r.errors,
    }),
    { stored: 0, updated: 0, skipped: 0, fetchErrors: 0, errors: 0 }
  );

  const extraction = drainExtractionStats();

  const failed = results.filter((r) => r.status === 'failed');
  const succeeded = results.filter((r) => r.status === 'success');

  console.log('\n========================================');
  console.log(args.dryRun ? '  DRY RUN SUMMARY' : '  SYNC SUMMARY');
  console.log('========================================');
  console.log(`  Sources:    ${results.length} (${succeeded.length} ok, ${failed.length} failed)`);
  console.log(`  New:        ${totals.stored}`);
  console.log(`  Updated:    ${totals.updated}`);
  console.log(`  Skipped:    ${totals.skipped}`);
  if (totals.fetchErrors > 0) console.log(`  Unreachable:${totals.fetchErrors}`);
  if (totals.errors > 0) console.log(`  Errors:     ${totals.errors}`);
  console.log('----------------------------------------');
  console.log(
    `  Ausgelesen: ${extraction.documents} Dok. / ${extraction.pages} S. ` +
      `(davon OCR: ${extraction.ocrDocuments} / ${extraction.ocrPages})`
  );
  console.log(`  Umsonst:    ${extraction.redundant} (ausgelesen, Text unverändert)`);
  console.log(
    `  Gespart:    ${extraction.skipped.not_modified} (304) | ` +
      `${extraction.skipped.same_bytes} (gleiche Bytes) | ` +
      `${extraction.skipped.freshly_indexed} (frisch)`
  );
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
      fetchErrors: totals.fetchErrors,
      errors: totals.errors,
    },
    extraction,
    totalDuration: Math.round((Date.now() - syncStart) / 1000),
  };

  const summaryPath = env.SYNC_SUMMARY_PATH ?? path.join(process.cwd(), 'sync-summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Summary written to ${summaryPath}`);

  // POST article-level events to the API (CI has no Postgres access).
  // Never fails the run — the feed is best-effort, the sync result is not.
  await postSyncEvents(args);

  // Send email notification via existing Brevo SMTP (never crash on email failure).
  // Per-LV runs (--landesverband): recipient comes from landesverbaendeContacts.json,
  // and the email is suppressed when nothing changed (stored + updated + hard errors == 0).
  // Other invocations (no flag, --source <id>) keep the previous behavior.
  if (!args.noEmail) {
    const isLvRun = !!args.landesverband;
    const hasChanges = totals.stored + totals.updated + totals.errors > 0;

    if (isLvRun && !hasChanges) {
      console.log(
        `Per-LV run ${args.landesverband}: no new/updated docs and no hard errors — skipping email`
      );
    } else {
      const emailTo = isLvRun
        ? (loadLandesverbandContacts()[args.landesverband as string] ?? env.CONTENT_SYNC_EMAIL)
        : env.CONTENT_SYNC_EMAIL;
      if (emailTo) {
        try {
          const runId = env.GITHUB_RUN_ID;
          const repo = env.GITHUB_REPOSITORY;
          const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
          const runUrl = runId && repo ? `${server}/${repo}/actions/runs/${runId}` : undefined;

          const sent = await sendContentSyncEmail(emailTo, {
            timestamp: summary.timestamp,
            totalDuration: summary.totalDuration,
            sources: summary.sources,
            totals: summary.totals,
            extraction: summary.extraction,
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
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

/**
 * Send the recorded article events to /api/internal/monitor/sync-events in
 * chunks. The matrix jobs each POST their own disjoint events; the endpoint's
 * (source_url, event_date) upsert makes retries idempotent.
 */
async function postSyncEvents(args: CliArgs): Promise<void> {
  const events = drainSyncEvents();
  if (args.dryRun || events.length === 0) return;

  if (!env.ADMIN_TOKEN) {
    console.log('Sync events: ADMIN_TOKEN not set — skipping POST');
    return;
  }

  const apiBase = (env.CONTENT_SYNC_API_URL ?? 'https://gruenerator.eu').replace(/\/$/, '');
  const endpoint = `${apiBase}/api/internal/monitor/sync-events`;
  const runId = env.GITHUB_RUN_ID ?? null;
  const repo = env.GITHUB_REPOSITORY;
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const runUrl = runId && repo ? `${server}/${repo}/actions/runs/${runId}` : null;

  const CHUNK_SIZE = 500;
  const MAX_ATTEMPTS = 3;

  for (let start = 0; start < events.length; start += CHUNK_SIZE) {
    const chunk = events.slice(start, start + CHUNK_SIZE);
    const body = JSON.stringify({ runId, runUrl, force: args.force, events: chunk });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': env.ADMIN_TOKEN },
          body,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log(
          `Sync events: posted ${chunk.length} events (${start + chunk.length}/${events.length})`
        );
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === MAX_ATTEMPTS) {
          console.error(
            `Sync events: POST failed after ${MAX_ATTEMPTS} attempts (non-fatal): ${msg}`
          );
        } else {
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
