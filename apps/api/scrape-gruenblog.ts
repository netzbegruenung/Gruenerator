/**
 * Grünblog Scraping Script
 *
 * Scrapes gruenblog.com — the online magazine of the German Green Party.
 * Discovers articles via /post-sitemap.xml and stores them in gruenblog_documents.
 *
 * Flags:
 *   --force     → Re-index all articles even if unchanged
 *   --max <n>   → Limit number of articles to process
 *
 * Run: npx tsx apps/api/scrape-gruenblog.ts
 */

import { gruenblogScraperService } from './services/scrapers/implementations/GruenblogScraper.js';

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

  console.log('=== Gruenblog Scraping Script ===');
  if (args.force) console.log('Force update: enabled');
  if (args.max) console.log(`Max articles: ${args.max}`);

  console.log('Initializing scraper...');
  await gruenblogScraperService.init();

  const result = await gruenblogScraperService.fullCrawl({
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
