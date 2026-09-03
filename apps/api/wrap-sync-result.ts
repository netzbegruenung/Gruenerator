/**
 * Wraps a single /api/internal/content-sync/source/:sourceId response
 * (success, failure, or 409-busy) into a SyncSummary-shaped JSON file, so
 * aggregate-sync-summaries.ts — which expects the original per-run summary
 * shape update-all-content.ts used to write directly — keeps working
 * unchanged now that CI triggers the sync over HTTP instead of running the
 * scraper in-runner (CI has no direct Qdrant network access).
 *
 * Usage: echo '<api response json>' | npx tsx wrap-sync-result.ts \
 *          --id <id> --http-code <code> [--dry-run] [--force]
 */
import { type SourceGroupResult, type SyncSummary } from './types/syncTypes.js';

interface Args {
  id: string;
  httpCode: number;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let id = '';
  let httpCode = 200;
  let dryRun = false;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--id') id = argv[++i];
    else if (argv[i] === '--http-code') httpCode = Number(argv[++i]);
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--force') force = true;
  }
  if (!id) {
    console.error('Usage: ... --id <id> --http-code <code> [--dry-run] [--force]');
    process.exit(1);
  }
  return { id, httpCode, dryRun, force };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

interface ApiResponse {
  success?: boolean;
  name?: string;
  stored?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  errorSamples?: string[];
  deadLinks?: number;
  deadLinkSamples?: string[];
  skipReasons?: Record<string, number>;
  fetchErrors?: number;
  durationMs?: number;
  error?: string;
}

async function main() {
  const { id, httpCode, dryRun, force } = parseArgs();
  const raw = await readStdin();

  let response: ApiResponse;
  try {
    response = JSON.parse(raw) as ApiResponse;
  } catch {
    response = { error: `Unparseable response (HTTP ${httpCode}): ${raw.slice(0, 500)}` };
  }

  const durationSec = Math.round((response.durationMs ?? 0) / 1000);
  const succeeded = httpCode === 200 && response.success === true;

  const sourceResult: SourceGroupResult = succeeded
    ? {
        id,
        name: response.name ?? id,
        stored: response.stored ?? 0,
        updated: response.updated ?? 0,
        skipped: response.skipped ?? 0,
        fetchErrors: response.fetchErrors ?? 0,
        errors: response.errors ?? 0,
        ...(response.errorSamples?.length ? { errorSamples: response.errorSamples } : {}),
        ...(response.deadLinks ? { deadLinks: response.deadLinks } : {}),
        ...(response.deadLinkSamples?.length ? { deadLinkSamples: response.deadLinkSamples } : {}),
        ...(response.skipReasons && Object.keys(response.skipReasons).length > 0
          ? { skipReasons: response.skipReasons }
          : {}),
        duration: durationSec,
        status: 'success',
      }
    : {
        id,
        name: response.name ?? id,
        stored: 0,
        updated: 0,
        skipped: 0,
        fetchErrors: 0,
        errors: 1,
        duration: durationSec,
        status: 'failed',
        error: response.error ?? `HTTP ${httpCode}`,
      };

  const summary: SyncSummary = {
    timestamp: new Date().toISOString(),
    dryRun,
    force,
    sources: [sourceResult],
    totals: {
      sources: 1,
      succeeded: succeeded ? 1 : 0,
      failed: succeeded ? 0 : 1,
      stored: sourceResult.stored,
      updated: sourceResult.updated,
      skipped: sourceResult.skipped,
      fetchErrors: sourceResult.fetchErrors,
      errors: sourceResult.errors,
    },
    totalDuration: durationSec,
  };

  process.stdout.write(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
