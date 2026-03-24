import { ApifyClient } from 'apify-client';

import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { createLogger } from '../../../utils/logger.js';
import { mistralEmbeddingService } from '../../mistral/index.js';

const log = createLogger('SocialMediaExamplesScraper');

const INSTAGRAM_ACTOR = 'apify/instagram-post-scraper';
const FACEBOOK_ACTOR = 'apify/facebook-posts-scraper';
const DEFAULT_WAIT_SECS = 180;
const MAX_POSTS_PER_ACCOUNT = 50;

type Platform = 'instagram' | 'facebook';
type CountryCode = 'DE' | 'AT';

interface AccountConfig {
  handle: string;
  platform: Platform;
  country: CountryCode;
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

const ACCOUNTS: AccountConfig[] = [
  // DE — Bündnis 90/Die Grünen (Bundesverband)
  { handle: 'die_gruenen', platform: 'instagram', country: 'DE' },
  { handle: 'B90DieGruenen', platform: 'facebook', country: 'DE' },
  // AT — Die Grünen Österreich (Bundesverband)
  { handle: 'diegruenen', platform: 'instagram', country: 'AT' },
  { handle: 'diegruenen.at', platform: 'facebook', country: 'AT' },
];

function getClient(): ApifyClient | null {
  const token = process.env.APIFY_TOKEN;
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

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const posts: RawPost[] = [];

  for (const item of items) {
    const post = item as Record<string, any>;
    const caption = post.caption || post.text || '';
    const shortCode = post.shortCode || post.code;
    const postUrl = post.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : null);

    if (!postUrl || !shortCode || !caption || caption.length < 20) continue;

    posts.push({
      url: postUrl,
      content: caption,
      publishedAt: post.timestamp || post.taken_at || post.date || null,
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

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const posts: RawPost[] = [];

  for (const item of items) {
    const post = item as Record<string, any>;
    const text = post.text || post.message || post.postText || '';
    const postUrl = post.url || post.postUrl || null;

    if (!postUrl || !text || text.length < 20) continue;

    posts.push({
      url: postUrl,
      content: text,
      publishedAt: post.time || post.timestamp || post.date || null,
      sourceAccount: handle,
    });
  }

  return posts;
}

async function scrapeAccount(client: ApifyClient, account: AccountConfig): Promise<RawPost[]> {
  const fetcher = account.platform === 'instagram' ? fetchInstagramPosts : fetchFacebookPosts;
  return fetcher(client, account.handle, MAX_POSTS_PER_ACCOUNT);
}

export async function scrapeAndIndexSocialMedia(
  options: {
    forceUpdate?: boolean;
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

  log.info(`Starting social media examples sync for ${ACCOUNTS.length} accounts`);

  for (const account of ACCOUNTS) {
    const label = `${account.platform}:${account.handle} (${account.country})`;

    let posts: RawPost[];
    try {
      log.info(`Scraping ${label}...`);
      posts = await scrapeAccount(client, account);
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
