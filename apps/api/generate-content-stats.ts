/**
 * Generate Content Stats (CLI)
 *
 * Queries Qdrant for document counts and writes the docs markdown page to disk.
 * For CI (no direct Qdrant access), use GET /api/internal/content-sync/stats
 * instead — same rendering logic, served by services/scrapers/contentStats.ts.
 *
 * Usage: npx tsx apps/api/generate-content-stats.ts
 *
 * Requires: QDRANT_URL, QDRANT_API_KEY, QDRANT_BASIC_AUTH_USERNAME, QDRANT_BASIC_AUTH_PASSWORD
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { env } from './config/env.js';
import { getContentStatsMarkdown } from './services/scrapers/contentStats.js';

async function main() {
  console.log('Querying Qdrant for content statistics...');

  const { markdown, totalPoints } = await getContentStatsMarkdown();

  const outputPath =
    env.STATS_OUTPUT_PATH ??
    path.join(process.cwd(), 'documentation', 'docs', 'sonstiges', 'inhaltsdatenbank.md');

  writeFileSync(outputPath, markdown);
  console.log(`Stats page written to ${outputPath}`);
  console.log(`Total: ${totalPoints.toLocaleString('de-DE')} vectors`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
