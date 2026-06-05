/**
 * Sachsen-Anhalt Scraping Script
 *
 * Scrapes Grüne Sachsen-Anhalt content from two sites:
 *   www.gruene-lsa.de (WordPress — Landesverband):
 *     - sachsen-anhalt-lv: Pressemitteilungen (WP REST cat 9), Beschlüsse (cat 11),
 *       plus standalone campaign pages (/suse/, /kampagne/, /programm2026/) and the
 *       Landtagswahlprogramm 2026 PDF.
 *   gruene-fraktion-sachsen-anhalt.de (Neos — Fraktion):
 *     - sachsen-anhalt-fraktion: Pressemitteilungen
 *
 * Flags:
 *   --source <id>  → Run only a specific source (e.g., sachsen-anhalt-lv)
 *
 * Run: npx tsx apps/api/scrape-sachsen-anhalt.ts
 */

import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

const SACHSEN_ANHALT_SOURCES = ['sachsen-anhalt-lv', 'sachsen-anhalt-fraktion'];

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

  console.log('=== Sachsen-Anhalt Scraping Script ===');
  if (args.source) console.log(`Source filter: ${args.source}`);

  console.log('Initializing scraper...');
  await landesverbandScraperService.init();

  const sources = args.source ? [args.source] : SACHSEN_ANHALT_SOURCES;

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
