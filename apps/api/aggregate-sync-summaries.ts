/**
 * Aggregate Content Sync Summaries
 *
 * Merges per-source sync-summary JSON files (from parallel GitHub Actions matrix jobs)
 * into a single summary, then sends one email notification.
 *
 * Usage: npx tsx apps/api/aggregate-sync-summaries.ts --dir <path>
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { sendContentSyncEmail } from './services/email/emailService.js';

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

interface SyncSummary {
  timestamp: string;
  dryRun: boolean;
  force: boolean;
  sources: SourceGroupResult[];
  totals: {
    sources: number;
    succeeded: number;
    failed: number;
    stored: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  totalDuration: number;
}

function parseArgs(): { dir: string } {
  const args = process.argv.slice(2);
  let dir = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = args[++i];
  }
  if (!dir) {
    console.error('Usage: npx tsx aggregate-sync-summaries.ts --dir <path>');
    process.exit(1);
  }
  return { dir };
}

function main() {
  const { dir } = parseArgs();

  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error(`No JSON files found in ${dir}`);
    process.exit(1);
  }

  console.log(`Aggregating ${files.length} summary files from ${dir}`);

  const partials: SyncSummary[] = files.map((f) => {
    const content = readFileSync(path.join(dir, f), 'utf-8');
    return JSON.parse(content) as SyncSummary;
  });

  const allSources = partials.flatMap((p) => p.sources);
  const succeeded = allSources.filter((s) => s.status === 'success');
  const failed = allSources.filter((s) => s.status === 'failed');

  const merged: SyncSummary = {
    timestamp: partials.reduce(
      (earliest, p) => (p.timestamp < earliest ? p.timestamp : earliest),
      partials[0].timestamp
    ),
    dryRun: partials[0].dryRun,
    force: partials[0].force,
    sources: allSources,
    totals: {
      sources: allSources.length,
      succeeded: succeeded.length,
      failed: failed.length,
      stored: allSources.reduce((sum, s) => sum + s.stored, 0),
      updated: allSources.reduce((sum, s) => sum + s.updated, 0),
      skipped: allSources.reduce((sum, s) => sum + s.skipped, 0),
      errors: allSources.reduce((sum, s) => sum + s.errors, 0),
    },
    totalDuration: Math.max(...partials.map((p) => p.totalDuration)),
  };

  const summaryPath =
    process.env.SYNC_SUMMARY_PATH || path.join(process.cwd(), 'sync-summary.json');
  writeFileSync(summaryPath, JSON.stringify(merged, null, 2));
  console.log(`Merged summary written to ${summaryPath}`);

  // Send email
  const emailTo = process.env.CONTENT_SYNC_EMAIL;
  if (emailTo) {
    const runId = process.env.GITHUB_RUN_ID;
    const repo = process.env.GITHUB_REPOSITORY;
    const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
    const runUrl = runId && repo ? `${server}/${repo}/actions/runs/${runId}` : undefined;

    sendContentSyncEmail(emailTo, {
      timestamp: merged.timestamp,
      totalDuration: merged.totalDuration,
      sources: merged.sources,
      totals: merged.totals,
      runUrl,
      dryRun: merged.dryRun,
    })
      .then((sent) =>
        console.log(
          sent ? `Email sent to ${emailTo}` : 'Email sending skipped (SMTP not configured)'
        )
      )
      .catch((err) =>
        console.error(
          'Email notification failed (non-fatal):',
          err instanceof Error ? err.message : err
        )
      );
  }
}

main();
