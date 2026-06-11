/**
 * Hessen Scraping Script
 *
 * Scrapes Grüne Hessen content (one WordPress Multisite, www.gruene-hessen.de):
 *   - hessen-lv:       Partei Pressemitteilungen (/partei/presse/) + Beschlüsse (/partei/beschluss/)
 *   - hessen-fraktion: Landtagsfraktion Pressemitteilungen (/landtag/presse/)
 *
 * Both sources are fully config-driven (see apps/api/config/landesverbaendeConfig.ts) and
 * honour the standard 5-year freshness window. Equivalent to `scrape-all.ts --landesverband HE`.
 *
 * Flags:
 *   --source <id>   → Run only a specific source (e.g., hessen-fraktion)
 *   --max <number>  → Limit number of documents to scrape per content path
 *   --force         → Re-process even if already stored
 *
 * Run: npx tsx apps/api/scrape-hessen.ts
 * Run: npx tsx apps/api/scrape-hessen.ts --source hessen-fraktion --max 20
 */

import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

const HESSEN_SOURCES = ['hessen-lv', 'hessen-fraktion'];

function parseArgs(): { source?: string; max?: number; force?: boolean } {
  const args = process.argv.slice(2);
  const result: { source?: string; max?: number; force?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source') {
      result.source = args[++i];
    } else if (args[i] === '--max') {
      result.max = parseInt(args[++i], 10);
    } else if (args[i] === '--force') {
      result.force = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  console.log('=== Hessen Scraping Script ===');

  console.log('Initializing scraper...');
  await landesverbandScraperService.init();

  if (args.source) console.log(`Source filter: ${args.source}`);
  if (args.max) console.log(`Max documents per path: ${args.max}`);
  if (args.force) console.log('Force update: yes');

  const sources = args.source ? [args.source] : HESSEN_SOURCES;

  for (const sourceId of sources) {
    console.log(`\nScraping source: ${sourceId}`);

    try {
      const result = await landesverbandScraperService.scrapeSource(sourceId, {
        forceUpdate: !!args.force,
        ...(args.max ? { maxDocuments: args.max } : {}),
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
