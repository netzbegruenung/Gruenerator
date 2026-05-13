/**
 * Phase 2 one-off backfill: pulls the last ~12 months of @Ricarda_Lang tweets
 * via X API v2 user-timeline and indexes them into the dedicated
 * `ricarda_lang_tweets` Qdrant collection.
 *
 * Usage:
 *   npx tsx apps/api/scripts/backfillRicardaLangTweets.ts
 *
 * Prerequisites:
 *   - `X_BEARER_TOKEN` set in apps/api/.env
 *   - `MISTRAL_API_KEY` set (used for embeddings)
 *   - Backend has booted at least once so QdrantService.init() created the
 *     `ricarda_lang_tweets` collection (registered in qdrantCollectionsSchema.ts)
 *
 * Caveats:
 *   - X API access tier determines how far back `startTime` can reach. Free
 *     tier: 7 days only. Basic/Pro/Enterprise: longer windows. The script
 *     attempts a 12-month range and surfaces whatever X returns.
 *   - User-timeline endpoint caps at 3200 recent tweets regardless of date.
 *   - This is intentionally NOT wired into update-all-content.ts or the
 *     content-sync GitHub Actions workflow. Future incremental sync (cron)
 *     is deferred — the watermark gets updated at the end of this run so a
 *     later cron entry will resume from the latest tweet seen here.
 */
import * as dotenv from 'dotenv';

dotenv.config();

const { xApiScraper } = await import('../services/scrapers/implementations/XApiScraper.js');

const HANDLE = 'Ricarda_Lang';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
// X API caps user-timeline at ~3200 tweets total; 5000 is a comfortable upper
// bound to ensure pagination runs until the API stops returning a next_token.
const MAX_TWEETS = 5000;

async function main(): Promise<void> {
  const startTime = new Date(Date.now() - ONE_YEAR_MS).toISOString();
  console.log(`[backfill] @${HANDLE} since ${startTime}, cap ${MAX_TWEETS} tweets`);

  await xApiScraper.init();
  const result = await xApiScraper.scrape({
    handles: [HANDLE],
    maxTweetsPerRun: MAX_TWEETS,
    ignoreWatermark: true,
    paginate: true,
    startTime,
  });

  console.log('[backfill] done');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[backfill] failed', error);
  process.exit(1);
});
