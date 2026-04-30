/**
 * Berlin Scraping Script
 *
 * Scrapes Grüne Berlin content from two sites:
 *   gruene.berlin (Typo3 CMS — Landesverband):
 *     - berlin-lv-presse: Nachrichten/Pressemitteilungen
 *     - berlin-lv-beschluesse: Beschlüsse
 *   gruene-fraktion.berlin (WordPress — Fraktion):
 *     - berlin-fraktion-presse: Pressemitteilungen
 *     - berlin-fraktion-beschluesse: Beschlüsse
 *
 * Flags:
 *   --source <id>  → Run only a specific source (e.g., berlin-lv-presse)
 *
 * Run: npx tsx apps/api/scrape-berlin.ts
 */

import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

const BERLIN_SOURCES = [
  'berlin-lv-presse',
  'berlin-lv-beschluesse',
  'berlin-fraktion-presse',
  'berlin-fraktion-beschluesse',
];

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

  console.log('=== Berlin Scraping Script ===');
  if (args.source) console.log(`Source filter: ${args.source}`);

  console.log('Initializing scraper...');
  await landesverbandScraperService.init();

  const sources = args.source ? [args.source] : BERLIN_SOURCES;

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
