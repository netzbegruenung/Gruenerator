/**
 * Nordrhein-Westfalen Scraping Script
 *
 * Scrapes Grüne NRW (gruene-nrw.de) and the Grüne Landtagsfraktion NRW
 * (gruene-fraktion-nrw.de), both WordPress, discovered via the WP REST API:
 *   nordrhein-westfalen-lv: Pressemitteilungen (cat 29), Beschlüsse (cat 5),
 *     FAQ (cat 431), Soundingboard (cat 558), Aktuelles (cat 1).
 *   nordrhein-westfalen-fraktion: Pressemitteilungen (cat 135), Publikationen (cat 137),
 *     Fachnewsletter (cat 144).
 *
 * Flags:
 *   --source <id>  → Run only a specific source (e.g., nordrhein-westfalen-lv)
 *
 * Run: npx tsx apps/api/scrape-nordrhein-westfalen.ts
 */

import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

const NRW_SOURCES = ['nordrhein-westfalen-lv', 'nordrhein-westfalen-fraktion'];

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

  console.log('=== Nordrhein-Westfalen Scraping Script ===');
  if (args.source) console.log(`Source filter: ${args.source}`);

  console.log('Initializing scraper...');
  await landesverbandScraperService.init();

  const sources = args.source ? [args.source] : NRW_SOURCES;

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
