/**
 * Brandenburg Scraping Script
 *
 * Scrapes Grüne Brandenburg content from two websites:
 *   - brandenburg-lv: gruene-brandenburg.de (WordPress) — Presse, Beschlüsse (PDF), Wahlprogramme (PDF)
 *   - brandenburg-archive-presse: archiv.gruene-brandenburg.de (Typo3) — Presse (bis Juli 2025)
 *   - brandenburg-archive-beschluesse: archiv.gruene-brandenburg.de (Typo3) — Beschlüsse (bis 2022)
 *
 * Flags:
 *   --source <id>  → Run only a specific source (e.g., brandenburg-lv)
 *
 * Run: npx tsx apps/api/scrape-brandenburg.ts
 */

import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

const BRANDENBURG_SOURCES = [
  'brandenburg-lv',
  'brandenburg-archive-presse',
  'brandenburg-archive-beschluesse',
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

  console.log('=== Brandenburg Scraping Script ===');
  if (args.source) console.log(`Source filter: ${args.source}`);

  console.log('Initializing scraper...');
  await landesverbandScraperService.init();

  const sources = args.source ? [args.source] : BRANDENBURG_SOURCES;

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
