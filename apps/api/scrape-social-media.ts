/**
 * Social Media Examples Scraping Runner
 *
 * Scrapes Instagram + Facebook posts via Apify and indexes them into the
 * `social_media_examples` Qdrant collection. Each post is tagged with
 * `country` ('DE'|'AT'), `source_account`, and — for LV accounts —
 * `landesverband` (e.g. 'BE'). The `landesverband` keyword index on the
 * collection must exist for per-LV filter queries to be fast.
 *
 * Flags:
 *   --lv <code>            Scrape one LV (BE | HH | MV | TH | BB). Federal
 *                          accounts are excluded from the run.
 *   --all-lvs              Scrape all 5 LVs sequentially (no federal).
 *   --max-posts <N>        Max posts per account (default 50).
 *   --platform <name>      Restrict to one platform: instagram | facebook.
 *                          Omit to scrape both. Use when a registered FB
 *                          handle is non-public (Apify returns
 *                          "not_available") and you don't want to keep
 *                          paying for empty fetches.
 *
 * Federal accounts (die_gruenen, B90DieGruenen, diegruenen, diegruenen.at)
 * are intentionally out of scope here — the existing 1180 records in
 * social_media_examples already cover the federal layer.
 *
 * Pattern mirrors scrape-berlin.ts / scrape-hamburg.ts.
 *
 * Run:
 *   node --env-file=.env --env-file=apps/api/.env --import tsx \
 *        apps/api/scrape-social-media.ts --lv BE --max-posts 20
 */

import { scrapeAndIndexSocialMedia } from './services/scrapers/implementations/SocialMediaExamplesScraper.js';

type Mode = 'single-lv' | 'all-lvs';
type Platform = 'instagram' | 'facebook';

interface CliArgs {
  mode: Mode;
  lv?: string;
  maxPosts?: number;
  platform?: Platform;
}

const VALID_LVS = ['BE', 'HH', 'MV', 'TH', 'BB'] as const;
const VALID_PLATFORMS: readonly Platform[] = ['instagram', 'facebook'];

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let mode: Mode | null = null;
  let lv: string | undefined;
  let maxPosts: number | undefined;
  let platform: Platform | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--lv':
        mode = 'single-lv';
        lv = args[++i];
        break;
      case '--all-lvs':
        mode = 'all-lvs';
        break;
      case '--max-posts': {
        const n = parseInt(args[++i] ?? '', 10);
        if (Number.isFinite(n) && n > 0) maxPosts = n;
        break;
      }
      case '--platform':
        platform = args[++i] as Platform;
        break;
    }
  }

  if (mode === null) {
    console.error('Missing mode flag. Use --lv <code> or --all-lvs.');
    process.exit(1);
  }
  if (mode === 'single-lv' && !VALID_LVS.includes(lv as (typeof VALID_LVS)[number])) {
    console.error(`--lv must be one of: ${VALID_LVS.join(', ')}`);
    process.exit(1);
  }
  if (platform !== undefined && !VALID_PLATFORMS.includes(platform)) {
    console.error(`--platform must be one of: ${VALID_PLATFORMS.join(', ')}`);
    process.exit(1);
  }

  return {
    mode,
    ...(lv && { lv }),
    ...(maxPosts != null && { maxPosts }),
    ...(platform != null && { platform }),
  };
}

async function runOne(label: string, lvCode?: string, maxPosts?: number, platform?: Platform) {
  console.log(`\n--- [START] ${label} ---`);
  const start = Date.now();
  const result = await scrapeAndIndexSocialMedia({
    ...(lvCode != null && { landesverband: lvCode }),
    ...(maxPosts != null && { maxPostsPerAccount: maxPosts }),
    ...(platform != null && { platforms: [platform] }),
  });
  const sec = Math.round((Date.now() - start) / 1000);
  console.log(
    `[DONE] ${label}: stored=${result.stored} fetchErrors=${result.fetchErrors} errors=${result.errors} (${sec}s)`
  );
  return result;
}

async function main() {
  const args = parseArgs();
  console.log('=== Social Media Scraping Runner ===');
  console.log(`Mode: ${args.mode}${args.lv ? ` (lv=${args.lv})` : ''}`);
  if (args.maxPosts != null) console.log(`Max posts per account: ${args.maxPosts}`);
  if (args.platform != null) console.log(`Platform: ${args.platform}`);

  if (args.mode === 'single-lv') {
    await runOne(`LV ${args.lv}`, args.lv, args.maxPosts, args.platform);
  } else {
    for (const lv of VALID_LVS) {
      await runOne(`LV ${lv}`, lv, args.maxPosts, args.platform);
    }
  }

  console.log('\n=== COMPLETE ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
