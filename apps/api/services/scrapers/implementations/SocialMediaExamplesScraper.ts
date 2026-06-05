import { ApifyClient } from 'apify-client';

import { env } from '../../../config/env.js';
import { LV_SOCIAL_ACCOUNTS } from '../../../config/landesverbaendeSocialAccounts.js';
import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { createLogger } from '../../../utils/logger.js';
import { mistralEmbeddingService } from '../../mistral/index.js';

const log = createLogger('SocialMediaExamplesScraper');

const INSTAGRAM_ACTOR = 'apify/instagram-post-scraper';
const FACEBOOK_ACTOR = 'apify/facebook-posts-scraper';
const DEFAULT_WAIT_SECS = 180;
const DEFAULT_MAX_POSTS_PER_ACCOUNT = 50;

type Platform = 'instagram' | 'facebook';
type CountryCode = 'DE' | 'AT';

interface AccountConfig {
  handle: string;
  platform: Platform;
  country: CountryCode;
  /** Set for per-LV accounts; absent for federal/AT accounts. */
  landesverband?: string;
}

interface ScrapeResult {
  stored: number;
  updated: number;
  skipped: number;
  fetchErrors: number;
  errors: number;
}

interface RawPost {
  url: string;
  content: string;
  publishedAt: string | null;
  sourceAccount: string;
}

const FEDERAL_ACCOUNTS: AccountConfig[] = [
  // DE — Bündnis 90/Die Grünen (Bundesverband)
  { handle: 'die_gruenen', platform: 'instagram', country: 'DE' },
  { handle: 'B90DieGruenen', platform: 'facebook', country: 'DE' },
  // AT — Die Grünen Österreich (Bundesverband)
  { handle: 'diegruenen', platform: 'instagram', country: 'AT' },
  { handle: 'diegruenen.at', platform: 'facebook', country: 'AT' },
];

/**
 * Union of federal accounts (no `landesverband`) + per-LV accounts (from
 * `landesverbaendeSocialAccounts.ts`). Optional `landesverband` filter
 * narrows to a single LV for targeted re-scrapes — federal accounts are
 * excluded when the filter is active because they have no LV ownership.
 */
function getScrapeTargets(opts: { landesverband?: string } = {}): AccountConfig[] {
  const lvTargets: AccountConfig[] = LV_SOCIAL_ACCOUNTS.map((acc) => ({
    handle: acc.handle,
    platform: acc.platform,
    country: acc.country,
    landesverband: acc.lv,
  }));
  const all = [...FEDERAL_ACCOUNTS, ...lvTargets];
  if (opts.landesverband !== undefined) {
    return all.filter((t) => t.landesverband === opts.landesverband);
  }
  return all;
}

function getClient(): ApifyClient | null {
  const token = env.APIFY_TOKEN;
  if (!token) return null;
  return new ApifyClient({ token });
}

async function fetchInstagramPosts(
  client: ApifyClient,
  handle: string,
  maxItems: number
): Promise<RawPost[]> {
  const run = await client.actor(INSTAGRAM_ACTOR).call(
    {
      username: [handle],
      resultsLimit: maxItems,
    },
    { waitSecs: DEFAULT_WAIT_SECS }
  );

  // eslint-disable-next-line @typescript-eslint/await-thenable -- apify-client listItems() returns an awaitable PaginatedIterator (official usage)
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const posts: RawPost[] = [];

  for (const item of items) {
    const post = item as Record<string, unknown>;
    const caption = (post.caption || post.text || '') as string;
    const shortCode = post.shortCode || post.code;
    const postUrl = (post.url ||
      (shortCode ? `https://www.instagram.com/p/${shortCode}/` : null)) as string | null;

    if (!postUrl || !shortCode || !caption || caption.length < 20) continue;

    posts.push({
      url: postUrl,
      content: caption,
      publishedAt: (post.timestamp || post.taken_at || post.date || null) as string | null,
      sourceAccount: handle,
    });
  }

  return posts;
}

async function fetchFacebookPosts(
  client: ApifyClient,
  handle: string,
  maxItems: number
): Promise<RawPost[]> {
  const run = await client.actor(FACEBOOK_ACTOR).call(
    {
      startUrls: [{ url: `https://www.facebook.com/${handle}` }],
      resultsLimit: maxItems,
    },
    { waitSecs: DEFAULT_WAIT_SECS }
  );

  // eslint-disable-next-line @typescript-eslint/await-thenable -- apify-client listItems() returns an awaitable PaginatedIterator (official usage)
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const posts: RawPost[] = [];

  for (const item of items) {
    const post = item as Record<string, unknown>;
    const text = (post.text || post.message || post.postText || '') as string;
    const postUrl = (post.url || post.postUrl || null) as string | null;

    if (!postUrl || !text || text.length < 20) continue;

    posts.push({
      url: postUrl,
      content: text,
      publishedAt: (post.time || post.timestamp || post.date || null) as string | null,
      sourceAccount: handle,
    });
  }

  return posts;
}

async function scrapeAccount(
  client: ApifyClient,
  account: AccountConfig,
  maxPosts: number
): Promise<RawPost[]> {
  const fetcher = account.platform === 'instagram' ? fetchInstagramPosts : fetchFacebookPosts;
  return fetcher(client, account.handle, maxPosts);
}

export async function scrapeAndIndexSocialMedia(
  options: {
    forceUpdate?: boolean;
    /** Restrict scrape to a single Landesverband short code (e.g. 'BE'). */
    landesverband?: string;
    /** Override max posts fetched per account (default 50). */
    maxPostsPerAccount?: number;
    /**
     * Restrict scrape to specific platforms. Use when an account's FB page
     * is private (Apify returns an `error: "not_available"` row) so re-runs
     * don't burn quota on guaranteed-empty fetches. Omit to scrape both.
     */
    platforms?: readonly Platform[];
  } = {}
): Promise<ScrapeResult> {
  const result: ScrapeResult = { stored: 0, updated: 0, skipped: 0, fetchErrors: 0, errors: 0 };

  const client = getClient();
  if (!client) {
    log.warn('APIFY_TOKEN not configured — skipping social media examples sync');
    return result;
  }

  const qdrant = getQdrantInstance();
  if (!(await qdrant.isAvailable())) {
    log.error('Qdrant not available — cannot index social media examples');
    result.errors = 1;
    return result;
  }

  await mistralEmbeddingService.init();
  if (!mistralEmbeddingService.isReady()) {
    log.error('Mistral embedding service not ready — cannot index social media examples');
    result.errors = 1;
    return result;
  }

  const allTargets = getScrapeTargets({
    ...(options.landesverband !== undefined && { landesverband: options.landesverband }),
  });
  const targets =
    options.platforms !== undefined && options.platforms.length > 0
      ? allTargets.filter((t) => options.platforms!.includes(t.platform))
      : allTargets;
  const scopeLabel = [
    options.landesverband ? `landesverband=${options.landesverband}` : null,
    options.platforms ? `platforms=${options.platforms.join(',')}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  log.info(
    `Starting social media examples sync for ${targets.length} accounts${scopeLabel ? ` (${scopeLabel})` : ''}`
  );

  if (targets.length === 0 && options.landesverband !== undefined) {
    log.warn(
      `No accounts configured for landesverband=${options.landesverband} — check LV_SOCIAL_ACCOUNTS roster`
    );
    return result;
  }

  for (const account of targets) {
    const lvTag = account.landesverband ? ` [lv=${account.landesverband}]` : '';
    const label = `${account.platform}:${account.handle} (${account.country})${lvTag}`;

    let posts: RawPost[];
    try {
      log.info(`Scraping ${label}...`);
      posts = await scrapeAccount(
        client,
        account,
        options.maxPostsPerAccount ?? DEFAULT_MAX_POSTS_PER_ACCOUNT
      );
      log.info(`Fetched ${posts.length} posts from ${label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to scrape ${label}: ${message}`);
      result.fetchErrors++;
      continue;
    }

    for (const post of posts) {
      try {
        const embedding = await mistralEmbeddingService.generateEmbedding(post.content);

        await qdrant.indexSocialMediaExample(post.url, embedding, post.content, account.platform, {
          country: account.country,
          source_account: post.sourceAccount,
          ...(account.landesverband && { landesverband: account.landesverband }),
        });

        result.stored++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to index post ${post.url}: ${message}`);
        result.errors++;
      }
    }
  }

  log.info(
    `Social media sync complete: ${result.stored} stored, ${result.fetchErrors} fetch errors, ${result.errors} index errors`
  );

  return result;
}
