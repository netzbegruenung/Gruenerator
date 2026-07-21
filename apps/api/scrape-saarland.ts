/**
 * Saarland Scraping Script
 *
 * Scrapes Grüne Saarland content from gruene-saar.de (WordPress):
 *   saarland-lv: Pressemitteilungen (WP REST API cat 7), Artikel (topic-category
 *   union), Parteitags-Beschlüsse & Dokumente (PDF archives), Vielfalt page.
 *
 * Flags:
 *   --source <id>  → Run only a specific source (e.g., saarland-lv)
 *
 * Run: npx tsx apps/api/scrape-saarland.ts
 */

import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

const SAARLAND_SOURCES = ['saarland-lv'];

function parseArgs(): { source?: string } {
  const args = process.argv.slice(2);
  const result: { source?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source') {
      result.source = args[++i];
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  console.log('=== Saarland Scraping Script ===');
  if (args.source) console.log(`Source filter: ${args.source}`);

  console.log('Initializing scraper...');
  await landesverbandScraperService.init();

  const sources = args.source ? [args.source] : SAARLAND_SOURCES;

  for (const sourceId of sources) {
    console.log(`\nScraping source: ${sourceId}`);

    try {
      const result = await landesverbandScraperService.scrapeSource(sourceId, {
        forceUpdate: false,
      });
      console.log(`Result for ${sourceId}:`, JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(`Error scraping ${sourceId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\n=== COMPLETE ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
