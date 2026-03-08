/**
 * Grüne Österreich (gruene.at) Scraping Script
 *
 * Scrapes gruene.at — news, policy positions, and election programs.
 * Discovers content via Yoast SEO sitemaps and stores in gruene_at_documents.
 *
 * Flags:
 *   --force     Re-index all pages even if unchanged
 *   --max <n>   Limit number of pages to process
 *
 * Run: npx tsx apps/api/scrape-gruene-at.ts
 */

import { grueneAtScraperService } from './services/scrapers/implementations/GrueneAtScraper.js';

function parseArgs(): { force: boolean; max: number | null } {
  const args = process.argv.slice(2);
  const result: { force: boolean; max: number | null } = { force: false, max: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force') {
      result.force = true;
    } else if (args[i] === '--max') {
      result.max = parseInt(args[++i], 10) || null;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  console.log('=== Gruene Oesterreich (gruene.at) Scraping Script ===');
  if (args.force) console.log('Force update: enabled');
  if (args.max) console.log(`Max pages: ${args.max}`);

  console.log('Initializing scraper...');
  await grueneAtScraperService.init();

  const result = await grueneAtScraperService.fullCrawl({
    forceUpdate: args.force,
    maxArticles: args.max,
  });

  console.log('\nFinal result:', JSON.stringify(result, null, 2));
  console.log('\n=== COMPLETE ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
