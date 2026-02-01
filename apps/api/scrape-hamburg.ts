import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

async function main() {
  console.log('Initializing scraper...');
  await landesverbandScraperService.init();

  console.log('Starting Hamburg presse scrape...');
  const result = await landesverbandScraperService.scrapeSource('hamburg-lv-presse', {
    forceUpdate: false,
  });

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
